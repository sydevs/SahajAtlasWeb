import type {
  Event,
  EventSlim,
  GeoFeature,
  Geojson,
  Region,
  RegionListItem,
  RegionNode,
} from '@/types'
import type { EventFilters, GeoEvent, RegionIndex } from '@/lib/shape'
import type { Position } from 'geojson'

import client from './client'

import i18n from '@/config/i18n'
import { GEOJSON_STALE_TIME, REGIONS_STALE_TIME, queryClient } from '@/config/query-client'
import { centerOfBounds, distanceKm } from '@/lib/geo'
import {
  ancestorIds,
  boundsUnder,
  byNextOccurrence,
  countUnder,
  childRoute,
  childrenOf,
  DEFAULT_FILTERS,
  indexRegions,
  isOnline,
  matchesFilters,
  parentOf,
  partitionUnder,
  resolveImageUrl,
  safePath,
} from '@/lib/shape'
import {
  ClientSchema,
  EventDocSchema,
  EventSlimSchema,
  EventTitleSchema,
  GeojsonSchema,
  RegionListItemSchema,
  RegionNodeSchema,
  RegionSchema,
} from '@/types'

// Most we return from a "near here" search, ordered by distance.
const NEAREST_LIMIT = 50

// The region fields populated into the geojson feed + event reads. Ancestry comes
// from the wholesale regions dict (parent links), so no `breadcrumbs` here (they
// were ~20% of the feed); slug/name drive display, the route is the server `webPath`.
const REGION_POPULATE = {
  regions: { slug: true, name: true, level: true, subtitle: true },
}

// The event fields the (locale-agnostic) geojson feed selects — must mirror
// AgnosticFeedEventSchema. `title` is the one localized field, so it is NOT selected
// here; it's joined in per-locale from the titles sliver (see loadEventTitles).
// `webPath` is the server-computed canonical route, navigated to directly.
const FEED_SELECT = {
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

// ── Wholesale region tree (agnostic, cache-once) ────────────────────────────────

// Every region at every level in one read. Ancestry, child lists, counts, and the
// 0-event gate all derive from this dict client-side — replacing the per-navigation
// `getRegionDoc`/`getChildRegions` reads and getCountries' own `/regions` read.
// Region names are locale-agnostic, so this is cached once regardless of language.
// `legacyData` is transitional (see `countryCodeOf`).
const REGIONS_SELECT = {
  slug: true,
  name: true,
  subtitle: true,
  level: true,
  parent: true,
  webPath: true,
  webUrl: true,
  legacyData: true,
}

const getRegions = async (): Promise<RegionNode[]> => {
  const response = await client.get('/regions', {
    params: { depth: 0, pagination: false, sort: 'name', select: REGIONS_SELECT },
  })

  return RegionNodeSchema.array().parse(response.data.docs)
}

// Read the region tree through the shared React Query cache so the whole app
// fetches + parses it once per (long) stale window rather than on every
// navigation. `fetchQuery` (not `ensureQueryData`) refetches a stale tree.
const loadRegions = (): Promise<RegionNode[]> =>
  queryClient.fetchQuery({
    queryKey: ['regions'],
    queryFn: getRegions,
    staleTime: REGIONS_STALE_TIME,
  })

// ── GeoJSON feed (agnostic geometry + counts) ──────────────────────────────────

const getGeojson = async (): Promise<Geojson> => {
  const response = await client.get('/events/geojson', {
    params: { depth: 1, pagination: false, select: FEED_SELECT, populate: REGION_POPULATE },
  })

  return GeojsonSchema.parse(response.data)
}

// The hierarchy/events fetchers all need the same feed. Read it through the shared
// React Query cache (the key the map also uses) so it's fetched + parsed once per
// stale window rather than on every navigation. It's locale-agnostic, so `['geojson']`
// carries no locale — a language switch doesn't refetch it, only the titles sliver.
const loadGeojson = (): Promise<Geojson> =>
  // fetchQuery (not ensureQueryData) so a feed older than the stale window is
  // refetched rather than served indefinitely from cache.
  queryClient.fetchQuery({
    queryKey: ['geojson'],
    queryFn: getGeojson,
    staleTime: GEOJSON_STALE_TIME,
  })

// ── Per-locale event titles (the one localized field, split off the feed) ───────

// `title` is the only localized field on an event card, so it's read on its own —
// a lean id→title map from `GET /api/events` — instead of riding the whole feed.
// Keyed by locale so a language switch refetches just this (~5% of the feed weight)
// while the agnostic feed + region tree stay cached.
const getEventTitles = async (): Promise<Map<number, string>> => {
  const response = await client.get('/events', {
    params: { depth: 0, pagination: false, select: { title: true } },
  })

  return new Map(
    EventTitleSchema.array()
      .parse(response.data.docs)
      .map((doc) => [doc.id, doc.title ?? '']),
  )
}

const loadEventTitles = (): Promise<Map<number, string>> =>
  queryClient.fetchQuery({
    // The interceptor sends the resolved locale; key by the same value so a language
    // switch re-keys the titles sliver (the agnostic feed + regions stay cached).
    queryKey: ['event-titles', i18n.resolvedLanguage || 'en'],
    queryFn: getEventTitles,
    staleTime: GEOJSON_STALE_TIME,
  })

// A feature paired with its region ancestry (direct region + full parent chain).
// `GeoEvent`-compatible, so the hierarchy helpers can aggregate over it while the
// `feature` rides along for building the event list — computed once per feature.
type IndexedFeature = GeoEvent & { feature: GeoFeature }

const indexFeatures = (geojson: Geojson, regions: RegionIndex<RegionNode>): IndexedFeature[] =>
  geojson.features.map((feature) => ({
    feature,
    point: feature.geometry?.coordinates ?? null,
    // Online belongs to no place: classified by eventType, never geometry (a
    // coordinate-less *offline* event still counts as located).
    online: isOnline(feature.properties),
    // Full ancestry (self → … → country) walked up the region tree from the
    // event's direct region id — no breadcrumbs needed on the feed.
    ancestorIds: ancestorIds(regions, feature.properties.region.id),
  }))

// Build a list/map item from an agnostic feed feature, joining its localized `title`
// (from the per-locale titles map — `''` if a title is somehow missing, so a data
// gap can't fail the parse). The feed carries the canonical `webPath`; fall back to
// a flat `/id` only if it's ever absent.
const toSlim = (feature: GeoFeature, title: string | undefined, from?: Position): EventSlim =>
  EventSlimSchema.parse({
    ...feature.properties,
    title: title ?? '',
    path: safePath(feature.properties.webPath) ?? `/${feature.properties.id}`,
    distance: from && feature.geometry ? distanceKm(from, feature.geometry.coordinates) : undefined,
  })

// ── Region-tree derivation (routes, ISO code, list items) ───────────────────────

// The canonical route (`webPath`) is server-computed; fall back to a flat `/slug`.
const regionRoute = (node: RegionNode): string => safePath(node.webPath) ?? `/${node.slug}`

// ISO alpha-2 country code (drives the flag + localized name). Post-SahajCloud#556
// the country slug *is* the code, so derive it from the slug first; fall back to
// the pre-migration `legacyData.countryCode` (transitional — drop once the backend
// seed reflects #556). Guard the shape so a malformed value can't throw in
// `Intl.DisplayNames` / `CircleFlag` downstream.
const isoCountryCode = (value: string | null | undefined): string | undefined =>
  typeof value === 'string' && /^[A-Za-z]{2}$/.test(value) ? value : undefined

const countryCodeOf = (node: RegionNode): string | undefined =>
  isoCountryCode(node.slug) ?? isoCountryCode(node.legacyData?.countryCode)

const toListItem = (node: RegionNode, eventCount: number): RegionListItem =>
  RegionListItemSchema.parse({
    id: node.id,
    slug: node.slug,
    level: node.level,
    name: node.name ?? node.slug,
    subtitle: node.subtitle,
    eventCount,
    path: regionRoute(node),
  })

// Busiest first — order a region list by event count, descending. A stable sort
// keeps equal counts in the incoming (server) order.
const byEventCountDesc = (a: RegionListItem, b: RegionListItem) => b.eventCount - a.eventCount

// ── Hierarchy fetchers (region tree + geojson-derived counts/bounds) ────────────

// Home/search country list — level=country regions with counts + ISO code, both
// derived from the cached region tree + feed (no dedicated /regions read, and no
// titles — a country card shows no event title, so this stays locale-agnostic).
const getCountries = async (): Promise<RegionListItem[]> => {
  const [regions, geojson] = await Promise.all([loadRegions(), loadGeojson()])
  const index = indexRegions(regions)
  const events = indexFeatures(geojson, index)

  return regions
    .filter((node) => node.level === 'country')
    .map((node) =>
      RegionListItemSchema.parse({
        id: node.id,
        slug: node.slug,
        level: node.level,
        name: node.name ?? node.slug,
        countryCode: countryCodeOf(node),
        eventCount: countUnder(events, node.id),
        path: regionRoute(node),
      }),
    )
    .filter((country) => country.eventCount > 0)
    .sort(byEventCountDesc)
}

// One fetcher for every region level. Parents (`country`/`region`) list their
// child regions as cards; leaves (`city`/`center`) list their located events.
// Every level rolls up the placeless online events under it. Node/children/
// ancestry come from the cached region tree; bounds/center/counts from the feed;
// event titles from the per-locale titles map, joined by id.
const getRegion = async (slug: string): Promise<Region> => {
  const [regions, geojson, titles] = await Promise.all([
    loadRegions(),
    loadGeojson(),
    loadEventTitles(),
  ])
  const index = indexRegions(regions)
  const node = index.bySlug.get(slug)

  if (!node) throw new Error(`Region not found: ${slug}`)

  const events = indexFeatures(geojson, index)

  // A region with no events under it (located or online) isn't a destination — 404
  // it (the nearest ErrorBoundary renders the not-found state) rather than render an
  // empty page. Mirrors getCountries hiding 0-event countries from the home list.
  const eventCount = countUnder(events, node.id)

  if (eventCount === 0) throw new Error(`Region has no events: ${slug}`)

  const path = regionRoute(node)
  const isParent = node.level === 'country' || node.level === 'region'
  const bounds = boundsUnder(events, node.id)

  // Parents split their located events across child regions; a leaf has no children,
  // so every located event lands in `direct`. Online events roll up at every level.
  const children = isParent ? childrenOf(index, node.id) : []
  const { byChild, direct, online } = partitionUnder(
    events,
    node.id,
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
    const slim = toSlim(indexed.feature, titles.get(indexed.feature.properties.id))

    return { ...slim, path: childRoute(path, slim.id) }
  }

  return RegionSchema.parse({
    id: node.id,
    slug: node.slug,
    name: node.name ?? node.slug,
    level: node.level,
    subtitle: node.subtitle,
    countryCode: node.level === 'country' ? countryCodeOf(node) : undefined,
    // Total (located + online), so a subtree holding only online events still renders.
    eventCount,
    bounds,
    center: bounds ? centerOfBounds(bounds) : null,
    path,
    parentPath: parentOf(path),
    webUrl: node.webUrl,
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
  const [geojson, titles] = await Promise.all([loadGeojson(), loadEventTitles()])
  const from: Position = [longitude, latitude]

  // Filter the whole feed *before* the nearest-N slice, so a restrictive filter
  // returns the nearest matching events rather than whatever survives among the
  // nearest N. Shares the exact predicate the map applies. (The rendered sets can
  // still differ: online events carry no map geometry, and this list is capped at
  // NEAREST_LIMIT while the map is not.)
  return geojson.features
    .filter((feature) => matchesFilters(feature.properties, filters))
    .map((feature) => toSlim(feature, titles.get(feature.properties.id), from))
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
