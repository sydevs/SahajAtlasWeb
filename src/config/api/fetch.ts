import type {
  AtlasConfig,
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
  ATLAS_CONFIG_STALE_TIME,
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
  AtlasConfigSchema,
  ClientSchema,
  EventDocSchema,
  EventSlimSchema,
  EventTitleSchema,
  GeojsonSchema,
  RegionListItemSchema,
  RegionNodeSchema,
  RegionSchema,
} from '@/types'

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
  // O(1) capacity signal (SahajCloud#601) — a denormalized boolean, so the feed
  // carries fullness without a per-event count.
  registrationsFull: true,
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
//
// Each also pins `gcTime`. These three caches are the whole point of the architecture —
// fetched once, read by everything — but React Query counts retention from the moment
// the LAST OBSERVER unmounts, and some of them are observed only intermittently (the
// titles sliver) or not at all in a `map=false` embed (the feed). The 5-minute default
// therefore evicts the wholesale data during an ordinary idle gap and the next
// navigation re-downloads all of it. See WHOLESALE_GC_TIME.
//
// And each pins `retry: false`, which is NOT a new policy — it is the one `fetchQuery`
// applied for free (`if (options.retry === undefined) options.retry = false`) until
// `query-client.ts` gave the client a `retry` default, at which point that guard became
// dead code. It matters because these loaders are not leaves: `getRegion`/`getCountries`/
// `getEvents` await them from inside a query that retries on its own, so a retry here
// MULTIPLIES with that one — a single failing region open would make four requests for
// the feed while `MAX_QUERY_RETRIES` promised two. Retrying belongs to the observer layer.

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
//
// NOTE: this re-spells the key/fetcher/windows that `regionsQuery()` (`config/api/index.ts`)
// declares for the React call sites — two authorities for one cache entry, kept equal by
// hand. The repo's own answer to that is `eventTitlesQuery`, declared HERE beside its
// fetcher and re-exported from `index.ts` to dodge the import cycle; moving `regionsQuery`
// onto that pattern is the right fix and is out of scope for #97 (it restructures a loader
// a sibling branch may hold). Change either copy and change both.
const loadRegions = (): Promise<RegionNode[]> =>
  queryClient.ensureQueryData({
    queryKey: ['regions'],
    queryFn: getRegions,
    staleTime: REGIONS_STALE_TIME,
    gcTime: WHOLESALE_GC_TIME,
    retry: false,
    revalidateIfStale: true,
  })

// One region by id from the wholesale tree — the live-preview boot (issue #40) gets an
// id, not a slug, so it looks the node up rather than adding a per-region read.
const getRegionNodeById = async (id: number): Promise<RegionNode> => {
  const node = (await loadRegions()).find((region) => region.id === id)

  if (!node) throw atlasError('not-found', `Region not found: ${id}`)

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
    gcTime: WHOLESALE_GC_TIME,
    retry: false,
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

/**
 * The titles sliver's query contract — key, fetcher and stale window together.
 *
 * Shared by the loader below and by the drawer's loading/error chrome, which reads the
 * same sliver CACHE-ONLY to name the event whose view can't render. That read is
 * `enabled: false`, so a divergent key wouldn't error — it would silently miss, and the
 * title would just stop appearing on every fallback with every gate still green.
 *
 * Lives here rather than with the other factories in `config/api/index.ts` only because
 * that module imports this one; it is re-exported there so callers find them together.
 */
export const eventTitlesQuery = (locale: string) => ({
  queryKey: ['event-titles', locale] as const,
  queryFn: getEventTitles,
  staleTime: GEOJSON_STALE_TIME,
  // The most eviction-prone of the three: its only mounted observer is the drawer's
  // fallback chrome, which reads it `enabled: false`. Pinned so a locale's titles are
  // fetched once per session rather than once per idle gap.
  gcTime: WHOLESALE_GC_TIME,
})

const loadEventTitles = (): Promise<Map<number, string>> =>
  queryClient.ensureQueryData({
    // Through the shared factory: every request sends the resolved locale (activeLocale,
    // via applyRequestContext), and the drawer's fallback chrome reads this same sliver
    // cache-only — so the key has to have exactly one definition.
    ...eventTitlesQuery(activeLocale()),
    retry: false,
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
//
// The FALLBACK is guarded too, not just `webPath`. `slug` is an unconstrained server
// string, so `/${slug}` is an interpolation into an href: a slug of `/evil.com` yields
// `//evil.com`, and react-router renders a foreign-origin `to` verbatim as a plain anchor
// — a same-tab redirect in the HOST page's origin. Pre-dates issue #89, but that issue
// puts this route on the error screen, which is the one screen a lost viewer is scanning
// for something to click. `'/'` is the last resort: always safe, always exists.
export const regionRoute = (node: RegionNode): string =>
  safePath(node.webPath) ?? safePath(`/${node.slug}`) ?? '/'

// ISO alpha-2 country code (drives the flag + localized name). Post-SahajCloud#556
// the country slug *is* the ISO code, so it's derived straight from the slug — no
// more `legacyData` fallback. `isoCountryCode` (@/lib/shape/country) owns the guard +
// uppercase normalization, shared with the searched-country reader, so a non-ISO
// slug — e.g. an un-migrated local dev seed — yields no flag rather than an error.
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

  if (!node) throw atlasError('not-found', `Region not found: ${slug}`)

  // A region with no events under it (located or online) still resolves, and the view
  // renders EmptyEventList. It used to 404 into the error boundary, but nothing a viewer
  // could press there would help: a retry fails identically and it isn't a wrong turn
  // (issue #89). getCountries still hides 0-event countries from the home list, so this
  // is reached by a direct link or a region whose events have all ended — not by
  // navigating in.
  const eventCount = countUnder(events, node.id)
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

// ── Filtered feed (shared by the events list + the calendar) ─────────────────────

// The feed features passing the applied filters — the region cut included via the SAME
// `matchesFilters` predicate the map/list/count share — paired with the per-locale
// titles for joining. Keeps getEvents and getCalendarEvents on exactly one predicate.
const filteredFeed = async (
  filters: EventFilters,
): Promise<{ features: GeoFeature[]; titles: Map<number, string> }> => {
  const [geojson, titles, regions] = await Promise.all([
    loadGeojson(),
    loadEventTitles(),
    loadRegions(),
  ])
  // The region cut needs the tree; only built when a region is selected (else undefined
  // = no restriction), so the common path is unaffected.
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

  // The WHOLE matching set, distance-ranked — uncapped, like getCalendarEvents. The
  // list used to slice to the nearest 50 here, which truncated the pool the client
  // then sorted (so `?sort=soonest` meant "soonest among the 50 nearest") and put
  // match #51 permanently out of reach. Paging is a render budget, not a network one:
  // the feed is fetched once and cached, so the list reveals from this set a page at a
  // time (see `revealRows` in `@/lib/shape/reveal`). The rendered set can still differ
  // from the map, which has no geometry for online events and applies no distance cut.
  // `byDistance` rather than the inline subtraction this used to do: two distanceless
  // (online) events made that `Infinity - Infinity`, i.e. NaN — an invalid comparator
  // result. Latent while the nearest-50 slice kept online events off the rendered list;
  // uncapped they always form its tail, so the guarded comparator is the one to use.
  return features
    .map((feature) => toSlim(feature, titles.get(feature.properties.id), from))
    .sort(byDistance)
}

// ── Calendar source events (the whole filtered set, for occurrence expansion) ────

// Every event matching the filters, shaped for the CalendarView's occurrence
// expansion — title + canonical route joined. Unlike getEvents this is NOT distance-
// ranked or capped (a calendar shows the whole matching set, online events included);
// the client expands each event's `upcomingDates` into per-occurrence entries.
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
    // The concise calendar label sources: the parent region name, or the address
    // locality when the calendar is scoped to a region (see `eventsToCalendarEntries`).
    regionName: feature.properties.region?.name ?? null,
    locality: feature.properties.address?.city ?? null,
  }))
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
        registrationsFull: true,
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
        color1: true,
        color2: true,
        color3: true,
        allowedDomains: true,
        clientId: true,
        region: true,
        // `routing=path` reads its prefix out of `canonical.embed` — see `mountPrefix`.
        canonical: true,
      },
      populate: { regions: { slug: true, name: true, level: true, webPath: true, webUrl: true } },
    },
  })

  if (!user) throw atlasError('config', 'Not authenticated as an Atlas client')

  return ClientSchema.parse(user)
}

/**
 * The atlas-wide configuration global — read for the operator-owned language set
 * (sydevs/SahajCloud#645), and for nothing else.
 *
 * Raw `requestJson` rather than the SDK's typed `findGlobal`, for the same reason `getClient`
 * above is: the field is newer than our synced `payload-types.ts`, so `select: { languages: true }`
 * does not type-check against the generated `SyAtlasConfigSelect` until SahajCloud's own change
 * lands on `main` and `pnpm types:cms` picks it up. Selecting a column the server does not have
 * answers `{}` with a 200 rather than a 400 — verified against production — so the read is safe to
 * ship first, and `AtlasConfigSchema` is written to parse that answer.
 *
 * `depth: 0`: the rows are plain values, nothing to populate.
 */
const getAtlasConfig = async (): Promise<AtlasConfig> =>
  AtlasConfigSchema.parse(
    await requestJson<unknown>({
      method: 'GET',
      path: '/globals/sy-atlas-config',
      args: { depth: 0, select: { languages: true } },
    }),
  )

/**
 * The atlas-config query contract in one place — shared by the language guard that narrows the
 * active language at boot (`use-languages`), the settings picker, and the warm below, so the key
 * and its windows cannot drift between them.
 *
 * Declared here beside its fetcher rather than in `./index` (which would close an import cycle,
 * since that module imports this one) and re-exported from `@/config/api` with the rest.
 *
 * Locale is deliberately absent from the key: the rows are language CODES, identical in every
 * locale. `applyRequestContext` still puts `?locale=` on the wire — it does that for every
 * request — but nothing about the answer varies with it, so keying on it would just buy a second
 * copy of the same array per language a viewer tries.
 */
export const atlasConfigQuery = () => ({
  queryKey: ['atlas-config'] as const,
  queryFn: () => getAtlasConfig(),
  staleTime: ATLAS_CONFIG_STALE_TIME,
  // Pinned for the same reason the wholesale caches pin it: the default gcTime (5 min) is
  // SHORTER than the stale window above, so the entry could be evicted while still nominally
  // fresh — and the picker, which is the second reader, may not be opened for many minutes.
  gcTime: WHOLESALE_GC_TIME,
})

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

/**
 * Warm the operator-owned language set, in parallel with the client bootstrap the tree suspends
 * on — the same waterfall-break as `warmCaches`, for a read that has to land EARLY rather than
 * merely soon.
 *
 * The language guard corrects the active language when detection resolved to one the operator
 * does not offer. Read serially — after `clients/me` unblocks `AppShell` — that correction lands
 * a round trip *after* the interface has painted, and a viewer watches the widget change language
 * in front of them. Read in parallel it is settled before the first localized frame.
 *
 * ⚠ **Unlike `warmCaches`, this runs for a COMPACT embed too**, and the argument is the one that
 * keeps `clients/me` there: the card is themed and localized from the CMS, so which languages the
 * atlas is offered in is part of rendering the card at all, not part of the interface behind it.
 * The cost is one global read of a ten-row array, next to the client record already being fetched
 * — not the feed-and-region-tree pair that #161 removed from that path.
 *
 * `prefetchQuery` is handed the SHARED factory verbatim, deliberately: options passed here are
 * written onto the shared `Query` and read back by the observers, so a warm with options of its
 * own would silently re-tune both readers (see the pressure-knob rule in `.claude/rules/
 * data-layer.md`). Same object, nothing to diverge. It never rejects — React Query's prefetch
 * swallows the failure — so a dead global leaves the readers on the shipped bundles.
 */
const warmLanguages = (): void => {
  void queryClient.prefetchQuery(atlasConfigQuery())
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
  getAtlasConfig,
  warmCaches,
  warmLanguages,
}
