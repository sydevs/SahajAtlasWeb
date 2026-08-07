import type { EventFilters } from '@/lib/shape'

import fetch from './fetch'
import mutate from './mutate'

import {
  EVENTS_GC_TIME,
  EVENTS_STALE_TIME,
  REGIONS_STALE_TIME,
  WHOLESALE_GC_TIME,
} from '@/config/query-client'
import { filtersKey } from '@/lib/shape'

const api = {
  ...fetch,
  ...mutate,
}

// The client-record query contract in one place — shared by AppRouter's
// suspense read and BrandTheme's non-suspense read so the key + fetcher can't
// drift between them.
export const clientQuery = (apiKey?: string | null) => ({
  queryKey: ['client', apiKey] as const,
  queryFn: () => api.getClient(),
})

// The single-event query contract in one place — shared by EventView's suspense read
// and the card hover / idle prefetch (use-prefetch-event) so the key + fetcher can't
// drift. A prefetch under a divergent key would silently never hit, so both must build
// the key here. Locale is part of the key (the detail is localized).
export const eventQuery = (id: number, locale: string) => ({
  queryKey: ['event', id, locale] as const,
  queryFn: () => api.getEvent(id),
})

// The distance-ranked events query contract in one place — shared by the results
// list's suspense read and the SearchView story's cache seed, so the key can't drift
// (a seed under a divergent key silently misses and the story hits the network
// instead of rendering the state it exists to show). Latitude/longitude are quantized
// to 2 dp so small map moves don't refetch; the locale keys the localized titles.
// Sort is deliberately absent — it's presentation, re-applied client-side.
export const eventsQuery = (
  latitude: number,
  longitude: number,
  filters: EventFilters,
  locale: string,
) => ({
  queryKey: [
    'events',
    latitude.toFixed(2),
    longitude.toFixed(2),
    filtersKey(filters),
    locale,
  ] as const,
  queryFn: () => api.getEvents(latitude, longitude, filters),
  // This query makes no request — it re-derives the list from the already-cached feed
  // (full-feed predicate + a zod parse per surviving event + a distance sort). With
  // React Query's default `staleTime: 0` every remount of the drawer redid all of it
  // against bytes that could not have changed, so it's fresh for as long as the feed
  // it derives from is; the gc window is twice that, so an entry can't be dropped
  // before it even goes stale. See EVENTS_STALE_TIME.
  staleTime: EVENTS_STALE_TIME,
  gcTime: EVENTS_GC_TIME,
})

// The localized titles sliver's contract. Declared in `fetch.ts` beside the fetcher it
// wraps (declaring it here would close an import cycle, since this module imports that
// one) and surfaced here with the rest, so callers still find every factory in one place.
export { eventTitlesQuery } from './fetch'

// The wholesale region-tree query contract in one place — shared by the region
// matcher, the Region filter's options, and the region-pill name lookup so the key +
// fetcher + stale window can't drift. Locale-agnostic (region names ride the tree
// as-is), so no locale in the key.
export const regionsQuery = () => ({
  queryKey: ['regions'] as const,
  queryFn: () => api.getRegions(),
  staleTime: REGIONS_STALE_TIME,
  // Pinned, because the default gcTime (5 min) is SHORTER than the stale window above:
  // the tree could be evicted while still nominally fresh, and every navigation after
  // an idle gap would re-read the whole of /regions. See WHOLESALE_GC_TIME.
  gcTime: WHOLESALE_GC_TIME,
})

export default api
