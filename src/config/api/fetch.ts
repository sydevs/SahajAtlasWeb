import type {
  Event,
  EventSlim,
  GeoFeature,
  Geojson,
  Region,
  RegionDoc,
  RegionListItem,
} from '@/types'
import type { EventFilters, GeoEvent } from '@/lib/shape'
import type { Position } from 'geojson'

import client from './client'

import { GEOJSON_STALE_TIME, queryClient } from '@/config/query-client'
import { centerOfBounds, distanceKm } from '@/lib/geo'
import {
  ancestorIdsFromBreadcrumbs,
  boundsUnder,
  byNextOccurrence,
  countUnder,
  childRoute,
  DEFAULT_FILTERS,
  isOnline,
  matchesFilters,
  parentOf,
  partitionUnder,
  resolveImageUrl,
  safePath,
  todayISO,
} from '@/lib/shape'
import {
  ClientSchema,
  EventDocSchema,
  EventSlimSchema,
  GeojsonSchema,
  RegionDocSchema,
  RegionListItemSchema,
  RegionSchema,
} from '@/types'

// Most we return from a "near here" search, ordered by distance.
const NEAREST_LIMIT = 50

// The region fields populated into the geojson feed + event reads. `breadcrumbs`
// carries the ancestor `id`s used to aggregate event counts/bounds under a region
// (slug/name drive display); the canonical route comes from `webPath`, not these.
const REGION_POPULATE = {
  regions: { slug: true, name: true, level: true, subtitle: true, breadcrumbs: true },
}

// The event fields the geojson feed selects (must mirror FeedEventSchema). `webPath`
// is the server-computed canonical route, so map/list items navigate to it directly.
const FEED_SELECT = {
  title: true,
  eventType: true,
  languages: true,
  address: {
    street: true,
    room: true,
    postCode: true,
    country: true,
    region: true,
    city: true,
    latitude: true,
    longitude: true,
  },
  schedule: {
    firstDate: true,
    firstDate_tz: true,
    endTime: true,
    recurrenceType: true,
    upcomingDates: true,
    icalRule: true,
  },
  region: true,
  webPath: true,
}

// ── GeoJSON feed (single source of geometry + counts) ──────────────────────────

const getGeojson = async (): Promise<Geojson> => {
  const response = await client.get('/events/geojson', {
    params: { depth: 1, pagination: false, select: FEED_SELECT, populate: REGION_POPULATE },
  })

  return GeojsonSchema.parse(response.data)
}

// The hierarchy/events fetchers all need the same feed. Read it through the
// shared React Query cache (the key the map also uses) so it's fetched + parsed
// once per stale window rather than on every navigation.
const loadGeojson = (): Promise<Geojson> =>
  // fetchQuery (not ensureQueryData) so a feed older than the stale window is
  // refetched rather than served indefinitely from cache.
  queryClient.fetchQuery({
    queryKey: ['geojson'],
    queryFn: getGeojson,
    staleTime: GEOJSON_STALE_TIME,
  })

// A feature paired with its region ancestry (direct region + breadcrumb chain).
// `GeoEvent`-compatible, so the hierarchy helpers can aggregate over it while the
// `feature` rides along for building the event list — computed once per feature.
type IndexedFeature = GeoEvent & { feature: GeoFeature }

const indexFeatures = (geojson: Geojson): IndexedFeature[] =>
  geojson.features.map((feature) => ({
    feature,
    point: feature.geometry?.coordinates ?? null,
    // Online belongs to no place: classified by eventType, never geometry (a
    // coordinate-less *offline* event still counts as located).
    online: isOnline(feature.properties),
    ancestorIds: [
      ...new Set([
        feature.properties.region.id,
        ...ancestorIdsFromBreadcrumbs(feature.properties.region.breadcrumbs),
      ]),
    ],
  }))

// The feed carries the canonical `webPath`; fall back to a flat `/id` (still
// resolvable via the terminal segment) only if it's ever absent.
const toSlim = (feature: GeoFeature, from?: Position): EventSlim =>
  EventSlimSchema.parse({
    ...feature.properties,
    path: safePath(feature.properties.webPath) ?? `/${feature.properties.id}`,
    distance: from && feature.geometry ? distanceKm(from, feature.geometry.coordinates) : undefined,
  })

// ── Raw region reads ───────────────────────────────────────────────────────────

// The canonical route (`webPath`) is server-computed and virtual, so no depth /
// breadcrumb populate is needed. Slugs are globally unique, so no `level` filter —
// the level comes from the doc. Falls back to a flat `/slug` if webPath is absent.
const regionRoute = (doc: RegionDoc): string => safePath(doc.webPath) ?? `/${doc.slug}`

const getRegionDoc = async (slug: string): Promise<RegionDoc> => {
  const response = await client.get('/regions', {
    params: {
      where: { slug: { equals: slug } },
      depth: 1,
      limit: 1,
      select: {
        slug: true,
        name: true,
        level: true,
        subtitle: true,
        legacyData: true,
        webPath: true,
        webUrl: true,
      },
    },
  })

  const doc = response.data?.docs?.[0]

  if (!doc) throw new Error(`Region not found: ${slug}`)

  return RegionDocSchema.parse(doc)
}

const getChildRegions = async (parentId: number): Promise<RegionDoc[]> => {
  const response = await client.get('/regions', {
    params: {
      where: { parent: { equals: parentId } },
      depth: 0,
      limit: 1000,
      sort: 'name',
      select: { slug: true, name: true, level: true, subtitle: true, webPath: true },
    },
  })

  return RegionDocSchema.array().parse(response.data.docs)
}

// ISO alpha-2 country code (drives the flag + localized name) survives on
// legacyData. Validate the shape so a malformed value can't throw in
// `Intl.DisplayNames`/`CircleFlag` downstream.
const countryCodeOf = (doc: RegionDoc): string | undefined => {
  const code = doc.legacyData?.countryCode

  return typeof code === 'string' && /^[A-Za-z]{2}$/.test(code) ? code : undefined
}

const toListItem = (doc: RegionDoc, eventCount: number): RegionListItem =>
  RegionListItemSchema.parse({
    id: doc.id,
    slug: doc.slug,
    level: doc.level,
    name: doc.name ?? doc.slug,
    subtitle: doc.subtitle,
    eventCount,
    path: regionRoute(doc),
  })

// Busiest first — order a region list by event count, descending. A stable sort
// keeps equal counts in the incoming (server) order.
const byEventCountDesc = (a: RegionListItem, b: RegionListItem) => b.eventCount - a.eventCount

// ── Hierarchy fetchers (raw region + geojson-derived counts/bounds) ─────────────

// Home/search country list — level=country regions with counts + ISO code.
const getCountries = async (): Promise<RegionListItem[]> => {
  const [geojson, response] = await Promise.all([
    loadGeojson(),
    client.get('/regions', {
      params: {
        where: { level: { equals: 'country' } },
        depth: 0,
        limit: 1000,
        sort: 'name',
        select: { slug: true, name: true, level: true, legacyData: true, webPath: true },
      },
    }),
  ])

  const events = indexFeatures(geojson)

  return RegionDocSchema.array()
    .parse(response.data.docs)
    .map((doc) =>
      RegionListItemSchema.parse({
        id: doc.id,
        slug: doc.slug,
        level: doc.level,
        name: doc.name ?? doc.slug,
        countryCode: countryCodeOf(doc),
        eventCount: countUnder(events, doc.id),
        path: regionRoute(doc),
      }),
    )
    .filter((country) => country.eventCount > 0)
    .sort(byEventCountDesc)
}

// One fetcher for every region level. Parents (`country`/`region`) list their
// child regions as cards; leaves (`city`/`center`) list their located events.
// Every level rolls up the placeless online events under it. Path/webUrl come
// from the server; bounds/center/counts are derived from the feed.
const getRegion = async (slug: string): Promise<Region> => {
  // The region read and the feed are independent — load them in parallel.
  const [doc, geojson] = await Promise.all([getRegionDoc(slug), loadGeojson()])
  const events = indexFeatures(geojson)

  const path = regionRoute(doc)
  const isParent = doc.level === 'country' || doc.level === 'region'
  const bounds = boundsUnder(events, doc.id)

  // Parents split their located events across child regions; a leaf has no children,
  // so every located event lands in `direct`. Online events roll up at every level.
  const children = isParent ? await getChildRegions(doc.id) : []
  const { byChild, direct, online } = partitionUnder(
    events,
    doc.id,
    children.map((child) => child.id),
  )

  // Any child with ≥ 1 located event renders a card (badge = located count); an
  // online-only / empty child gets none — its online events still roll up below.
  const subregions: RegionListItem[] = []

  for (const child of children) {
    const located = byChild.get(child.id)?.length ?? 0

    if (located > 0) subregions.push(toListItem(child, located))
  }
  subregions.sort(byEventCountDesc)

  // Nest each event under *this* region's path so navigating to it keeps the full
  // region ancestry in the URL (an event's own webPath is flat / often null, which
  // would otherwise stack it straight on the country list).
  const nest = (indexed: IndexedFeature): EventSlim => {
    const slim = toSlim(indexed.feature)

    return { ...slim, path: childRoute(path, slim.id) }
  }

  return RegionSchema.parse({
    id: doc.id,
    slug: doc.slug,
    name: doc.name ?? doc.slug,
    level: doc.level,
    subtitle: doc.subtitle,
    countryCode: doc.level === 'country' ? countryCodeOf(doc) : undefined,
    // Total (located + online), so a subtree holding only online events still renders.
    eventCount: countUnder(events, doc.id),
    bounds,
    center: bounds ? centerOfBounds(bounds) : null,
    path,
    parentPath: parentOf(path),
    webUrl: doc.webUrl,
    subregions,
    // Located events directly under this region (a leaf's own events; parents
    // usually have none — a child's events are reached through the child's card).
    events: direct.map(nest),
    // Placeless online events under the region, soonest next occurrence first.
    onlineEvents: online.map(nest).sort(byNextOccurrence),
  })
}

// ── Events near a point (from the feed, sorted by distance) ─────────────────────

const getEvents = async (
  latitude: number,
  longitude: number,
  filters: EventFilters = DEFAULT_FILTERS,
): Promise<EventSlim[]> => {
  const geojson = await loadGeojson()
  const from: Position = [longitude, latitude]

  // Filter the whole feed *before* the nearest-N slice, so a restrictive filter
  // returns the nearest matching events rather than whatever survives among the
  // nearest N. Shares the exact predicate the map applies. (The rendered sets can
  // still differ: online events carry no map geometry, and this list is capped at
  // NEAREST_LIMIT while the map is not.)
  const today = todayISO()

  return geojson.features
    .filter((feature) => matchesFilters(feature.properties, filters, today))
    .map((feature) => toSlim(feature, from))
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
    .slice(0, NEAREST_LIMIT)
}

// ── Single event detail ─────────────────────────────────────────────────────────

const getEvent = async (id: number): Promise<Event> => {
  const response = await client.get(`/events/${id}`, {
    params: {
      depth: 1,
      select: {
        title: true,
        eventType: true,
        languages: true,
        onlineUrl: true,
        address: true,
        schedule: true,
        description: true,
        images: true,
        contactPhone: true,
        contactName: true,
        registrationMode: true,
        externalRegistrationUrl: true,
        registrationLimit: true,
        registrationQuestions: true,
        region: true,
        webPath: true,
        webUrl: true,
      },
      populate: {
        ...REGION_POPULATE,
        // `url` is a virtual field SahajCloud derives from `filename`, so we must
        // select `filename` or `url` comes back null. `thumbnailURL` doesn't exist
        // on this collection (Cloudflare Images flexible variants replaced sizes).
        images: { url: true, filename: true, alt: true },
      },
    },
  })

  const event = EventDocSchema.parse(response.data)

  return {
    ...event,
    // Resolve image URLs at the data boundary so every consumer gets a ready-to-use
    // absolute URL (SahajCloud serves relative image URLs in dev) — the same kind of
    // wire-quirk shaping as `path` below. Null urls stay null; the UI skips them.
    images: event.images.map((image) =>
      image.url ? { ...image, url: resolveImageUrl(image.url) } : image,
    ),
    path: safePath(event.webPath) ?? `/${event.id}`,
  }
}

// ── Widget bootstrap (client config + atlas-wide defaults) ───────────────────────

const getClient = async () => {
  const response = await client.get('/clients/me', {
    params: {
      depth: 1,
      select: {
        name: true,
        locale: true,
        color1: true,
        color2: true,
        color3: true,
        allowedDomains: true,
        clientId: true,
        region: true,
        legacyConfig: true,
      },
      populate: { regions: { slug: true, name: true, level: true, webPath: true, webUrl: true } },
    },
  })

  const user = response.data?.user

  if (!user) throw new Error('Not authenticated as an Atlas client')

  return ClientSchema.parse(user)
}

export default {
  getGeojson,
  getCountries,
  getEvents,
  getRegion,
  getEvent,
  getClient,
}
