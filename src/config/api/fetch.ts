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
import type { CalendarSourceEvent, EventFilters, GeoEvent, RegionIndex } from '@/lib/shape'
import type { Position } from 'geojson'

import sdk, { activeLocale, requestJson, validateSDKResponse } from './client'

import {
  GEOJSON_STALE_TIME,
  REGIONS_STALE_TIME,
  WHOLESALE_GC_TIME,
  queryClient,
} from '@/config/query-client'
import { centerOfBounds, distanceKm } from '@/lib/geo'
import { atlasError } from '@/lib/report'
import {
  ancestorIds,
  boundsUnder,
  buildRegionMatcher,
  byDistance,
  byNextOccurrence,
  countUnder,
  childRoute,
  childrenOf,
  DEFAULT_FILTERS,
  indexRegions,
  isOnline,
  isoCountryCode,
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

// These are the region fields for the geojson feed and the event reads.
// Ancestry comes from the wholesale regions dict, through parent links.
// This object has no `breadcrumbs` field. Breadcrumbs used to add about 20% to the feed size.
// `slug` and `name` control the display. The route is the server `webPath` field.
// `as const` keeps each `true` value literal. This satisfies the SDK's generated `RegionsSelect` type.
// A widened `boolean` type does not satisfy fields that require `true`.
const REGION_POPULATE = {
  regions: { slug: true, name: true, level: true, subtitle: true },
} as const

// These are the event fields the locale-agnostic geojson feed selects.
// This list must match `AgnosticFeedEventSchema`.
// `title` is the only localized field, so it is not in this list.
// `loadEventTitles` joins the title in later, per locale.
// `webPath` is the canonical route the server computes. The app navigates to it directly.
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
  // The feed carries the structured recurrence fields that the resolver and cards read.
  // Issue #52 verified this pass-through.
  // So cards derive event type and status the same way the panel does.
  // The feed does not include calendar-export-only fields: monthDay, weekdayOfMonth, untilDate, exclusions.
  // The export reads those fields from the full event document.
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
  // This is an O(1) capacity signal from SahajCloud#601.
  // It is a denormalized boolean. The feed reports fullness without a per-event count.
  registrationsFull: true,
  webPath: true,
}

// ── Wholesale region tree (agnostic, cache-once) ────────────────────────────────

// This reads every region at every level in one request.
// The client derives ancestry, child lists, counts, and the 0-event gate from this dict.
// This replaces the per-navigation `getRegionDoc` and `getChildRegions` reads.
// It also replaces `getCountries`' own `/regions` read.
// Region names do not depend on locale, so the app caches this once for every language.
// The ISO country code now comes from the slug. SahajCloud#556 put slug-to-ISO live in production.
// So this select no longer includes the `legacyData` blob, about 113 KB and 64% of this read's weight.
// That blob was only ever a country-code fallback. See `countryCodeOf`.
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

// The loaders below read the shared React Query cache through
// `ensureQueryData({ revalidateIfStale: true })`.
// A cold cache awaits the fetch. It throws to an ErrorBoundary on failure, which keeps the data-layer contract.
// A warm cache returns immediately and revalidates in the background when stale.
// So a navigation past the stale window never blocks on a slow refetch.
// That slow refetch used to cause the "sometimes slow" region open.
// A plain `fetchQuery` call would block on that refetch instead.
//
// Each loader also pins `gcTime`.
// These three caches fetch once and serve every reader, which is the point of this design.
// React Query counts retention from the moment the last observer unmounts.
// Some of these caches have only intermittent observers, like the titles sliver.
// Others have no observer at all in a `map=false` embed, like the feed.
//
// So the 5-minute default would evict the wholesale data during a normal idle gap.
// The next navigation would then re-download all of it.
// See `WHOLESALE_GC_TIME`.
//
// Each loader also pins `retry: false`. This is not a new policy.
// `fetchQuery` used to apply this same default for free, through a guard that checked for an undefined `retry` option.
// `query-client.ts` later gave the client its own `retry` default, so that guard became dead code.
//
// This setting matters because these loaders are not leaf reads.
// `getRegion`, `getCountries`, and `getEvents` await these loaders from inside a query that already retries on its own.
// A retry here would multiply with that outer retry.
// So a single failing region open could send four requests for the feed, though `MAX_QUERY_RETRIES` promised two.
// The observer layer owns retry behavior, not these loaders.

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

// This reads the region tree through the shared React Query cache.
// So the whole app fetches and parses it once per stale window, not on every navigation.
//
// NOTE: this repeats the key, fetcher, and cache windows that `regionsQuery()` in `config/api/index.ts` declares for React call sites.
// Two places define one cache entry, kept equal by hand.
// `eventTitlesQuery` shows this repo's real fix: it is declared HERE, beside its own fetcher, then re-exported from `index.ts` to avoid an import cycle.
// Moving `regionsQuery` onto that same pattern is the right fix.
// That change is out of scope for #97, because it restructures a loader that a sibling branch may also hold.
// Change one copy only together with the other.
const loadRegions = (): Promise<RegionNode[]> =>
  queryClient.ensureQueryData({
    queryKey: ['regions'],
    queryFn: getRegions,
    staleTime: REGIONS_STALE_TIME,
    gcTime: WHOLESALE_GC_TIME,
    retry: false,
    revalidateIfStale: true,
  })

// This finds one region by id in the wholesale tree.
// The live-preview boot in issue #40 supplies an id, not a slug.
// So this looks up the node instead of adding a separate per-region read.
const getRegionNodeById = async (id: number): Promise<RegionNode> => {
  const node = (await loadRegions()).find((region) => region.id === id)

  if (!node) throw atlasError('not-found', `Region not found: ${id}`)

  return node
}

// ── GeoJSON feed (agnostic geometry + counts) ──────────────────────────────────

const getGeojson = async (): Promise<Geojson> => {
  // This is a custom, non-CRUD endpoint.
  // So this call uses the SDK's raw `request` helper, not `sdk.find`.
  // The `select` and `populate` options still travel in the query string, as before.
  const data = await requestJson({
    method: 'GET',
    path: '/events/geojson',
    args: { depth: 1, pagination: false, select: FEED_SELECT, populate: REGION_POPULATE },
  })

  return GeojsonSchema.parse(data)
}

// The hierarchy fetchers and the events fetchers all need the same feed.
// This reads the feed through the shared React Query cache, under the same key the map uses.
// So the app fetches and parses the feed once per stale window, not on every navigation.
// The feed does not depend on locale, so its key `['geojson']` carries no locale value.
// A language switch does not refetch the feed. It refetches only the titles sliver.
const loadGeojson = (): Promise<Geojson> =>
  queryClient.ensureQueryData({
    queryKey: ['geojson'],
    queryFn: getGeojson,
    staleTime: GEOJSON_STALE_TIME,
    gcTime: WHOLESALE_GC_TIME,
    retry: false,
    revalidateIfStale: true,
  })

// ── Per-locale event titles (the one localized field, split off the feed) ───────

// `title` is the only localized field on an event card.
// So this reads titles on their own, as a lean id-to-title map from `GET /api/events`, instead of reading the whole feed.
// The cache key includes locale, so a language switch refetches only this map.
// This map is about 5% of the feed's weight. The locale-agnostic feed and region tree stay cached.
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

/**
 * This is the titles sliver's query contract: its key, fetcher, and stale window together.
 *
 * The loader below shares this contract. The drawer's loading and error chrome also shares it,
 * reading the same sliver CACHE-ONLY to name the event whose view cannot render.
 * That chrome read sets `enabled: false`. So a mismatched key would not throw an error.
 * It would silently miss, and the title would stop appearing on every fallback screen, with every check still passing.
 *
 * This contract lives here, not with the other factories in `config/api/index.ts`,
 * because that module imports this one. `index.ts` re-exports it, so callers still find every factory together.
 */
export const eventTitlesQuery = (locale: string) => ({
  queryKey: ['event-titles', locale] as const,
  queryFn: getEventTitles,
  staleTime: GEOJSON_STALE_TIME,
  // This cache is the most eviction-prone of the three.
  // Its only mounted observer is the drawer's fallback chrome, which reads it with `enabled: false`.
  // This value is pinned so a locale's titles fetch once per session, not once per idle gap.
  gcTime: WHOLESALE_GC_TIME,
})

const loadEventTitles = (): Promise<Map<number, string>> =>
  queryClient.ensureQueryData({
    // This uses the shared factory.
    // Every request sends the resolved locale through `activeLocale` and `applyRequestContext`.
    // The drawer's fallback chrome reads this same sliver cache-only.
    // So the key must have exactly one definition.
    ...eventTitlesQuery(activeLocale()),
    retry: false,
    revalidateIfStale: true,
  })

// This type pairs a feature with its region ancestry: the direct region plus the full parent chain.
// It is compatible with `GeoEvent`, so the hierarchy helpers can aggregate over it.
// The `feature` field stays attached, for building the event list.
// The app computes this once per feature.
type IndexedFeature = GeoEvent & { feature: GeoFeature }

const indexFeatures = (geojson: Geojson, regions: RegionIndex<RegionNode>): IndexedFeature[] =>
  geojson.features.map((feature) => ({
    feature,
    point: feature.geometry?.coordinates ?? null,
    // An online event belongs to no place.
    // The code classifies it by `eventType`, never by geometry.
    // A coordinate-less offline event still counts as located.
    online: isOnline(feature.properties),
    // This is the full ancestry, from the event itself up through its country.
    // It walks up the region tree from the event's direct region id.
    // The feed needs no breadcrumbs field for this.
    ancestorIds: ancestorIds(regions, feature.properties.region.id),
  }))

// The region index and the per-feature ancestry are pure derivations of the cached region tree and geojson feed.
// React Query returns both with a stable reference until a refetch replaces them.
// So this memoizes the derivation on those references.
// The app computes the derivation once per feed load and reuses it across every navigation.
// This avoids an O(regions) plus O(features) re-index on each `getCountries` or `getRegion` call.
// A refetch swaps the reference, and the memo recomputes on the next read.
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

// This builds a list or map item from an agnostic feed feature.
// It joins the localized `title` from the per-locale titles map.
// It falls back to an empty string if a title is missing, so a data gap cannot fail the parse.
// The feed carries the canonical `webPath` value.
// This falls back to a flat `/id` route only when `webPath` is absent.
const toSlim = (feature: GeoFeature, title: string | undefined, from?: Position): EventSlim =>
  EventSlimSchema.parse({
    ...feature.properties,
    title: title ?? '',
    path: safePath(feature.properties.webPath) ?? `/${feature.properties.id}`,
    distance: from && feature.geometry ? distanceKm(from, feature.geometry.coordinates) : undefined,
  })

// ── Region-tree derivation (routes, ISO code, list items) ───────────────────────

// The server computes the canonical route, `webPath`.
// This falls back to a flat `/slug` route.
// This function is exported so the live-preview controller in issue #40 reuses the same route derivation.
//
// The fallback route is guarded too, not only `webPath`.
// `slug` is an unconstrained server string, so `/${slug}` becomes text inside an href.
// A slug of `/evil.com` would produce `//evil.com`.
// react-router then renders that foreign-origin target as a plain anchor.
// A click would redirect the same tab to that foreign origin, inside the host page.
// This risk predates issue #89. That issue also puts this route on the error screen.
// A lost viewer scans that one screen for something to click.
// `'/'` is the last resort. It is always safe and it always exists.
export const regionRoute = (node: RegionNode): string =>
  safePath(node.webPath) ?? safePath(`/${node.slug}`) ?? '/'

// This derives the ISO alpha-2 country code, which drives the flag and the localized name.
// Since SahajCloud#556, the country slug is the ISO code itself.
// So this derives the code straight from the slug, with no `legacyData` fallback.
// `isoCountryCode` in `@/lib/shape/country` owns the guard and the uppercase normalization.
// The searched-country reader shares that same function.
// A non-ISO slug, such as an un-migrated local dev seed, yields no flag instead of an error.
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

// This orders a region list by event count, from busiest to quietest.
// A stable sort keeps equal counts in the order the server sent them.
const byEventCountDesc = (a: RegionListItem, b: RegionListItem) => b.eventCount - a.eventCount

// ── Hierarchy fetchers (region tree + geojson-derived counts/bounds) ────────────

// This builds the home and search country list.
// It lists level=country regions with counts and ISO codes.
// It derives both from the cached region tree and feed, with no dedicated `/regions` read.
// It reads no titles, because a country card shows no event title.
// So this list stays locale-agnostic.
const getCountries = async (): Promise<RegionListItem[]> => {
  const [regions, geojson] = await Promise.all([loadRegions(), loadGeojson()])
  const { events } = indexedFeed(regions, geojson)

  // Ordering is the list's own concern, not the feed's.
  // `CountriesView` sorts by event count.
  // So the display order holds even for a seeded story with an unsorted mock.
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

// This is one fetcher for every region level.
// Parent levels, `country` and `region`, list their child regions as cards.
// Leaf levels, `city` and `center`, list their located events instead.
// Every level also rolls up the placeless online events under it.
// The cached region tree supplies the node, its children, and its ancestry.
// The feed supplies bounds, center, and counts.
// The per-locale titles map supplies event titles, joined by id.
const getRegion = async (slug: string): Promise<Region> => {
  const [regions, geojson, titles] = await Promise.all([
    loadRegions(),
    loadGeojson(),
    loadEventTitles(),
  ])
  const { index, events } = indexedFeed(regions, geojson)
  const node = index.bySlug.get(slug)

  if (!node) throw atlasError('not-found', `Region not found: ${slug}`)

  // A region with no events under it, located or online, still resolves.
  // The view then renders `EmptyEventList`.
  // This used to throw a 404 into the error boundary instead.
  // Nothing a viewer could press there would help.
  // A retry there fails the same way. This is not a wrong turn. See issue #89.
  // `getCountries` still hides 0-event countries from the home list.
  // So a viewer reaches this state only through a direct link, or through a region whose events have all ended.
  // A viewer never reaches it by browsing in.
  const eventCount = countUnder(events, node.id)
  const path = regionRoute(node)
  const isParent = node.level === 'country' || node.level === 'region'
  const bounds = boundsUnder(events, node.id)

  // Parent regions split their located events across child regions.
  // A leaf region has no children, so every located event lands in `direct`.
  // Online events roll up at every level.
  const children = isParent ? childrenOf(index, node.id) : []
  const { byChild, direct, online } = partitionUnder(
    events,
    node.id,
    children.map((child) => child.id),
  )

  // Any child with 1 or more located events renders a card.
  // Its badge shows the located count.
  // An online-only or empty child gets no card. Its online events still roll up below.
  const subregions: RegionListItem[] = []

  for (const child of children) {
    const located = byChild.get(child.id)?.length ?? 0

    if (located > 0) subregions.push(toListItem(child, located))
  }
  subregions.sort(byEventCountDesc)

  // This nests each event under this region's own path.
  // So navigating to the event keeps the full region ancestry in the URL.
  // An event's own `webPath` is flat, and often null.
  // Without this nesting, the event would stack straight on the country list instead.
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
    // This total counts located events plus online events.
    // So a subtree holding only online events still renders.
    eventCount,
    bounds,
    center: bounds ? centerOfBounds(bounds) : null,
    path,
    parentPath: parentOf(path),
    webUrl: node.webUrl,
    subregions,
    // These are located events directly under this region.
    // For a leaf, these are its own events.
    // A parent region usually has none. A viewer reaches a child's events through the child's card instead.
    events: direct.map(nest),
    // These are placeless online events under the region, ordered by soonest next occurrence.
    onlineEvents: online.map(nest).sort(byNextOccurrence),
  })
}

// ── Filtered feed (shared by the events list + the calendar) ─────────────────────

// This returns the feed features that pass the applied filters.
// The region cut uses the SAME `matchesFilters` predicate that the map, list, and count share.
// This return value also carries the per-locale titles, for joining.
// This keeps `getEvents` and `getCalendarEvents` on exactly one predicate.
const filteredFeed = async (
  filters: EventFilters,
): Promise<{ features: GeoFeature[]; titles: Map<number, string> }> => {
  const [geojson, titles, regions] = await Promise.all([
    loadGeojson(),
    loadEventTitles(),
    loadRegions(),
  ])
  // The region cut needs the region tree.
  // This builds the matcher only when a viewer selects a region.
  // An undefined matcher means no restriction, so the common path is unaffected.
  const matchesRegion = buildRegionMatcher(regions, filters.region)
  const today = todayISO()

  return {
    features: geojson.features.filter((f) =>
      matchesFilters(f.properties, filters, today, matchesRegion),
    ),
    titles,
  }
}

// ── Events near a point (from the feed, sorted by distance) ─────────────────────

const getEvents = async (
  latitude: number,
  longitude: number,
  filters: EventFilters = DEFAULT_FILTERS,
): Promise<EventSlim[]> => {
  const { features, titles } = await filteredFeed(filters)
  const from: Position = [longitude, latitude]

  // This returns the WHOLE matching set, ranked by distance, with no cap. `getCalendarEvents` works the same way.
  // This code used to slice the list to the nearest 50 results here.
  // That slice truncated the pool before the client sorted it.
  // So `?sort=soonest` really meant "soonest among the 50 nearest."
  // Match #51 was then permanently out of reach.
  // Paging is a render budget, not a network one.
  // The app fetches and caches the feed once. The list then reveals this set a page at a time. See `revealRows` in `@/lib/shape/reveal`.
  // The rendered set can still differ from the map. The map has no geometry for online events, and it applies no distance cut.
  //
  // This code uses `byDistance` instead of the inline subtraction it used to do.
  // Two distanceless online events used to produce `Infinity - Infinity`, which is `NaN`, an invalid comparator result.
  // That bug stayed hidden while the nearest-50 slice kept online events off the rendered list.
  // Without the cap, online events always form the list's tail.
  // So this guarded comparator is the correct one to use.
  return features
    .map((feature) => toSlim(feature, titles.get(feature.properties.id), from))
    .sort(byDistance)
}

// ── Calendar source events (the whole filtered set, for occurrence expansion) ────

// This returns every event matching the filters, shaped for `CalendarView`'s occurrence expansion.
// Each entry joins the event's title with its canonical route.
// Unlike `getEvents`, this list is not ranked by distance, and it has no cap.
// A calendar shows the whole matching set, online events included.
// The client expands each event's `upcomingDates` field into per-occurrence entries.
const getCalendarEvents = async (
  filters: EventFilters = DEFAULT_FILTERS,
): Promise<CalendarSourceEvent[]> => {
  const { features, titles } = await filteredFeed(filters)

  return features.map((feature) => ({
    id: feature.properties.id,
    title: titles.get(feature.properties.id) ?? '',
    path: safePath(feature.properties.webPath) ?? `/${feature.properties.id}`,
    eventType: feature.properties.eventType,
    schedule: feature.properties.schedule,
    // This supplies the concise calendar label.
    // It uses the parent region name, or the address locality when the calendar is scoped to a region. See `eventsToCalendarEntries`.
    regionName: feature.properties.region?.name ?? null,
    locality: feature.properties.address?.city ?? null,
  }))
}

// ── Single event detail ─────────────────────────────────────────────────────────

/**
 * This shapes a parsed event document into the view-model `Event` type.
 * It resolves image URLs at the data boundary.
 * SahajCloud serves relative URLs in dev. A null url means a file-less image, and it stays null so the UI skips it.
 * It also derives a safe `path` value from `webPath`.
 * This function is exported so live preview in issue #40 reuses the same shaping.
 * Live preview applies this shaping to documents pushed over the postMessage stream, not only to fetched ones.
 */
export const shapeEventDoc = (event: EventDoc): Event => ({
  ...event,
  images: event.images.map((image) =>
    image.url ? { ...image, url: resolveImageUrl(image.url) } : image,
  ),
  path: safePath(event.webPath) ?? `/${event.id}`,
})

const getEventDoc = async (id: number): Promise<EventDoc> => {
  // This call sets no `disableErrors` option.
  // So a missing or failed read throws to the ErrorBoundary, the same way the old axios 404 did.
  // `validateSDKResponse` also narrows away the nullable return type.
  const doc = validateSDKResponse(
    await sdk.findByID({
      collection: 'events',
      id,
      depth: 1,
      // This select list has no `onlineUrl` field.
      // Atlas never shows a join link. The CMS delivers it after registration. See issue #52.
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
        registrationsFull: true,
        registrationQuestions: true,
        region: true,
        webPath: true,
        webUrl: true,
      },
      populate: {
        ...REGION_POPULATE,
        // `url` is a virtual field. SahajCloud derives it from `filename`.
        // So this select list must include `filename`, or `url` comes back null.
        // `thumbnailURL` does not exist on this collection.
        // Cloudflare Images flexible variants replaced fixed sizes here.
        images: { url: true, filename: true, alt: true },
      },
    }),
    `event ${id}`,
  )

  return EventDocSchema.parse(doc)
}

// This raw fetch stays a separate function.
// Live preview in issue #40 seeds `useLivePreview` with the unshaped document.
// It also merges live messages against that unshaped document.
// The caller shapes the result only afterward, before injection.
const getEvent = async (id: number): Promise<Event> => shapeEventDoc(await getEventDoc(id))

// ── Widget bootstrap (client config + atlas-wide defaults) ───────────────────────

const getClient = async () => {
  // This reads through the raw `request` helper, not `sdk.me()`.
  // SahajCloud requires an explicit `select` on every client read.
  // The bare `sdk.me()` call sends no `select`, `populate`, or `depth` option.
  // The trade-off: the type checker does not check this one `select` object, because this endpoint is not a typed collection read.
  // The runtime gate still checks it, though.
  const { user } = await requestJson<{ user?: unknown }>({
    method: 'GET',
    path: '/clients/me',
    args: {
      depth: 1,
      select: {
        name: true,
        color1: true,
        color2: true,
        color3: true,
        allowedDomains: true,
        clientId: true,
        region: true,
        // `routing=path` mode reads its prefix from `canonical.embed`. See `mountPrefix`.
        canonical: true,
      },
      populate: { regions: { slug: true, name: true, level: true, webPath: true, webUrl: true } },
    },
  })

  if (!user) throw atlasError('config', 'Not authenticated as an Atlas client')

  return ClientSchema.parse(user)
}

// ── Live-preview populate (issue #40) ────────────────────────────────────────────

// This renders an unsaved edit.
// It pushes the admin's form-state document through Payload's populate endpoint.
// That endpoint is a GET request sent through a method override.
// So it resolves relations and computed fields, such as `upcomingDates`, without saving.
// The shared interceptor authenticates the request with our API key and the preview secret.
// This function returns the raw document. The caller parses it.
// This request uses plain, non-credentialed CORS, with no admin-cookie round trip.
// So the CMS only needs the header allow-list from #575.
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

// This starts warming the locale-agnostic caches, the region tree and the geojson feed, as soon as the API key is set.
// It runs in parallel with the client bootstrap.
// The app suspends on `clients/me` (see `AppShell`), which would otherwise serialize every map or hierarchy read behind it.
// This function deliberately does not warm titles here.
// Titles key on the UI locale, and AppShell does not resolve that locale until after `clients/me`.
// So warming titles at mount would fetch under the wrong locale key, and the app would fetch them again anyway.
// This warm-up is best-effort and idempotent, since React Query merges in-flight fetches for the same key.
// This function swallows any failure.
// The real read's ErrorBoundary surfaces that failure later, instead of an unhandled rejection.
const warmCaches = (): void => {
  void loadGeojson().catch(() => {})
  void loadRegions().catch(() => {})
}

export default {
  getGeojson,
  getRegions,
  getCountries,
  getEvents,
  getCalendarEvents,
  getRegion,
  getRegionNodeById,
  getEvent,
  getEventDoc,
  populatePreviewDoc,
  getClient,
  warmCaches,
}
