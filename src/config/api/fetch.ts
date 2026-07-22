import type {
  Event,
  EventDoc,
  EventSlim,
  GeoFeature,
  Geojson,
  Region,
  RegionListItem,
  RegionNode,
} from '@/types'
import type { EventFilters, GeoEvent, RegionIndex } from '@/lib/shape'
import type { Position } from 'geojson'

import sdk, { activeLocale, requestJson, validateSDKResponse } from './client'

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
  todayISO,
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
// `as const` keeps the `true`s literal so the object satisfies the SDK's generated
// `RegionsSelect` (a widened `boolean` isn't assignable to its `true` fields).
const REGION_POPULATE = {
  regions: { slug: true, name: true, level: true, subtitle: true },
} as const

// The event fields the (locale-agnostic) geojson feed selects — must mirror
// AgnosticFeedEventSchema. `title` is the one localized field, so it is NOT selected
// here; it's joined in per-locale from the titles sliver (see loadEventTitles).
// `webPath` is the server-computed canonical route, navigated to directly.
const FEED_SELECT = {
  eventType: true,
  languages: true,
  inactive: true,
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
  // The structured recurrence fields the resolver/cards read ride the feed
  // (verified pass-through, issue #52) so cards derive type/status exactly as
  // the panel does. Calendar-export-only fields (monthDay, weekdayOfMonth,
  // untilDate, exclusions) stay off the feed — the export runs on the full doc.
  schedule: {
    firstDate: true,
    firstDate_tz: true,
    endTime: true,
    recurrenceType: true,
    interval: true,
    weekdays: true,
    monthlyMode: true,
    weekNumber: true,
    endingType: true,
    count: true,
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
// The ISO country code now comes from the slug (SahajCloud#556 slug→ISO is live in
// prod), so the ~113 KB `legacyData` blob — 64% of this read's weight, and only ever
// a country-code fallback — is no longer selected. See `countryCodeOf`.
const REGIONS_SELECT = {
  slug: true,
  name: true,
  subtitle: true,
  level: true,
  parent: true,
  webPath: true,
  webUrl: true,
} as const

// ── Region tree + feed reads (stale-while-revalidate) ───────────────────────────

// The imperative loaders below read the shared React Query cache with
// `ensureQueryData({ revalidateIfStale: true })`: a cold cache awaits the fetch (and
// throws on failure → ErrorBoundary, preserving the data-layer contract), while a warm
// cache returns immediately and revalidates in the background when stale — so a
// navigation past the stale window never *blocks* on the (cold-slow) refetch, the cause
// of the "sometimes slow" region open. (Plain `fetchQuery` would block on that refetch.)

const getRegions = async (): Promise<RegionNode[]> => {
  const { docs } = validateSDKResponse(
    await sdk.find({
      collection: 'regions',
      depth: 0,
      pagination: false,
      sort: 'name',
      select: REGIONS_SELECT,
    }),
    'regions',
  )

  return RegionNodeSchema.array().parse(docs)
}

// Read the region tree through the shared React Query cache so the whole app fetches +
// parses it once per (long) stale window rather than on every navigation.
const loadRegions = (): Promise<RegionNode[]> =>
  queryClient.ensureQueryData({
    queryKey: ['regions'],
    queryFn: getRegions,
    staleTime: REGIONS_STALE_TIME,
    revalidateIfStale: true,
  })

// One region by id from the wholesale tree — the live-preview boot (issue #40) gets an
// id, not a slug, so it looks the node up rather than adding a per-region read.
const getRegionNodeById = async (id: number): Promise<RegionNode> => {
  const node = (await loadRegions()).find((region) => region.id === id)

  if (!node) throw new Error(`Region not found: ${id}`)

  return node
}

// ── GeoJSON feed (agnostic geometry + counts) ──────────────────────────────────

const getGeojson = async (): Promise<Geojson> => {
  // A custom (non-CRUD) endpoint, so it goes through the SDK's raw `request` helper
  // rather than `sdk.find`; `select`/`populate` ride the query string as before.
  const data = await requestJson({
    method: 'GET',
    path: '/events/geojson',
    args: { depth: 1, pagination: false, select: FEED_SELECT, populate: REGION_POPULATE },
  })

  return GeojsonSchema.parse(data)
}

// The hierarchy/events fetchers all need the same feed. Read it through the shared
// React Query cache (the key the map also uses) so it's fetched + parsed once per
// stale window rather than on every navigation. It's locale-agnostic, so `['geojson']`
// carries no locale — a language switch doesn't refetch it, only the titles sliver.
const loadGeojson = (): Promise<Geojson> =>
  queryClient.ensureQueryData({
    queryKey: ['geojson'],
    queryFn: getGeojson,
    staleTime: GEOJSON_STALE_TIME,
    revalidateIfStale: true,
  })

// ── Per-locale event titles (the one localized field, split off the feed) ───────

// `title` is the only localized field on an event card, so it's read on its own —
// a lean id→title map from `GET /api/events` — instead of riding the whole feed.
// Keyed by locale so a language switch refetches just this (~5% of the feed weight)
// while the agnostic feed + region tree stay cached.
const getEventTitles = async (): Promise<Map<number, string>> => {
  const { docs } = validateSDKResponse(
    await sdk.find({ collection: 'events', depth: 0, pagination: false, select: { title: true } }),
    'event titles',
  )

  return new Map(
    EventTitleSchema.array()
      .parse(docs)
      .map((doc) => [doc.id, doc.title ?? '']),
  )
}

const loadEventTitles = (): Promise<Map<number, string>> =>
  queryClient.ensureQueryData({
    // Every request sends the resolved locale (activeLocale, via applyRequestContext);
    // key by that same value so a language switch re-keys the titles sliver (feed +
    // regions stay cached) and the key can't drift from the locale actually sent.
    queryKey: ['event-titles', activeLocale()],
    queryFn: getEventTitles,
    staleTime: GEOJSON_STALE_TIME,
    revalidateIfStale: true,
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

// The region index + per-feature ancestry are pure derivations of the (cached) region
// tree and geojson feed. Both come back from React Query with a stable reference until a
// refetch replaces them, so memoize the derivation on those references — computed once
// per feed load and reused across every navigation, instead of an O(regions)+O(features)
// re-index on each getCountries/getRegion call. A refetch swaps a reference and the memo
// recomputes on the next read.
let feedMemo: {
  regions: RegionNode[]
  geojson: Geojson
  index: RegionIndex<RegionNode>
  events: IndexedFeature[]
} | null = null

const indexedFeed = (regions: RegionNode[], geojson: Geojson) => {
  if (feedMemo && feedMemo.regions === regions && feedMemo.geojson === geojson) return feedMemo

  const index = indexRegions(regions)

  feedMemo = { regions, geojson, index, events: indexFeatures(geojson, index) }

  return feedMemo
}

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
// Exported so the live-preview controller (issue #40) reuses the exact route derivation.
export const regionRoute = (node: RegionNode): string => safePath(node.webPath) ?? `/${node.slug}`

// ISO alpha-2 country code (drives the flag + localized name). Post-SahajCloud#556
// the country slug *is* the ISO code, so it's derived straight from the slug — no
// more `legacyData` fallback. Guard the shape so a malformed value can't throw in
// `Intl.DisplayNames` / `CircleFlag` downstream (a non-ISO slug — e.g. an un-migrated
// local dev seed — simply yields no flag rather than an error).
const isoCountryCode = (value: string | null | undefined): string | undefined =>
  typeof value === 'string' && /^[A-Za-z]{2}$/.test(value) ? value : undefined

const countryCodeOf = (node: RegionNode): string | undefined => isoCountryCode(node.slug)

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
  const { events } = indexedFeed(regions, geojson)

  // Ordering is the list's concern, not the feed's — CountriesView sorts by event
  // count so the display order holds for a seeded story (unsorted mock) too.
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
  const { index, events } = indexedFeed(regions, geojson)
  const node = index.bySlug.get(slug)

  if (!node) throw new Error(`Region not found: ${slug}`)

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
  const today = todayISO()

  return geojson.features
    .filter((feature) => matchesFilters(feature.properties, filters, today))
    .map((feature) => toSlim(feature, titles.get(feature.properties.id), from))
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
    .slice(0, NEAREST_LIMIT)
}

// ── Single event detail ─────────────────────────────────────────────────────────

/**
 * Shape a parsed event doc into the view-model `Event`: resolve image URLs at the data
 * boundary (SahajCloud serves relative URLs in dev; a null url — a file-less image —
 * stays null and the UI skips it) and derive a safe `path` from `webPath`. Exported so
 * live preview (issue #40) reuses the exact same shaping on docs pushed in over the
 * postMessage stream, not only fetched ones.
 */
export const shapeEventDoc = (event: EventDoc): Event => ({
  ...event,
  images: event.images.map((image) =>
    image.url ? { ...image, url: resolveImageUrl(image.url) } : image,
  ),
  path: safePath(event.webPath) ?? `/${event.id}`,
})

const getEventDoc = async (id: number): Promise<EventDoc> => {
  // No `disableErrors`, so a missing/failed read throws (→ ErrorBoundary), as the
  // axios 404 did; `validateSDKResponse` also narrows away the nullable return.
  const doc = validateSDKResponse(
    await sdk.findByID({
      collection: 'events',
      id,
      depth: 1,
      // No `onlineUrl` — Atlas never shows a join link (delivery is CMS-side,
      // post-registration; issue #52).
      select: {
        title: true,
        eventType: true,
        languages: true,
        inactive: true,
        address: true,
        schedule: true,
        description: true,
        images: true,
        contactPhone: true,
        contactName: true,
        website: true,
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
    }),
    `event ${id}`,
  )

  return EventDocSchema.parse(doc)
}

// Raw fetch stays split out so live preview (issue #40) can seed `useLivePreview`
// with — and merge live messages against — the unshaped doc, then shape for injection.
const getEvent = async (id: number): Promise<Event> => shapeEventDoc(await getEventDoc(id))

// ── Widget bootstrap (client config + atlas-wide defaults) ───────────────────────

const getClient = async () => {
  // Read via the raw `request` helper, not `sdk.me()`: SahajCloud requires an explicit
  // `select` on every client read, and the bare `me()` sends no select/populate/depth.
  // (The trade-off is that this one `select` isn't compile-checked — the endpoint isn't
  // a typed collection read — but the runtime gate is still satisfied.)
  const { user } = await requestJson<{ user?: unknown }>({
    method: 'GET',
    path: '/clients/me',
    args: {
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

  if (!user) throw new Error('Not authenticated as an Atlas client')

  return ClientSchema.parse(user)
}

// ── Live-preview populate (issue #40) ────────────────────────────────────────────

// Render an unsaved edit: push the admin's form-state doc through Payload's populate
// endpoint (a GET via method-override, so it resolves relations + computed fields like
// upcomingDates without saving), authed with our API-key + preview secret via the shared
// interceptor. Returns the raw doc; the caller parses it. Plain (non-credentialed) CORS —
// no admin-cookie round-trip, so #575's header allow-list is all the CMS needs.
const populatePreviewDoc = async (
  collection: 'events' | 'regions',
  id: number,
  data: unknown,
  locale?: string,
): Promise<unknown> =>
  requestJson({
    method: 'POST',
    path: `/${collection}/${id}`,
    json: { data, depth: 1, flattenLocales: false, ...(locale ? { locale } : {}) },
    init: { headers: { 'X-Payload-HTTP-Method-Override': 'GET' } },
  })

// ── Bootstrap warm-up (break the clients/me → data waterfall) ────────────────────

// Kick the locale-agnostic caches (region tree + geojson feed) warming as soon as the
// API key is set, in parallel with the client bootstrap — the app suspends on clients/me
// (see AppShell), which otherwise serializes every map / hierarchy read behind it.
// Titles are deliberately NOT warmed here: they key on the UI locale, which isn't
// resolved until AppShell applies the client/widget locale (after clients/me), so
// warming at mount would fetch under the wrong locale key and be re-fetched anyway.
// Best-effort + idempotent (React Query dedupes in-flight fetches); a failure is swallowed
// so it re-surfaces through the real read's ErrorBoundary, not as an unhandled rejection.
const warmCaches = (): void => {
  void loadGeojson().catch(() => {})
  void loadRegions().catch(() => {})
}

export default {
  getGeojson,
  getCountries,
  getEvents,
  getRegion,
  getRegionNodeById,
  getEvent,
  getEventDoc,
  populatePreviewDoc,
  getClient,
  warmCaches,
}
