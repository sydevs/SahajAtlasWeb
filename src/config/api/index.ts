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

// This is the client-record query contract, in one place.
// AppRouter's suspense read and BrandTheme's non-suspense read both share it.
// So the key and fetcher can never drift between them.
export const clientQuery = (apiKey?: string | null) => ({
  queryKey: ['client', apiKey] as const,
  queryFn: () => api.getClient(),
})

// This is the single-event query contract, in one place.
// EventView's suspense read and the card hover and idle prefetch, `use-prefetch-event`, both share it.
// So the key and fetcher can never drift.
// A prefetch under a divergent key would silently never hit, so both must build the key here.
// Locale is part of the key, since the detail is localized.
export const eventQuery = (id: number, locale: string) => ({
  queryKey: ['event', id, locale] as const,
  queryFn: () => api.getEvent(id),
})

// This is the distance-ranked events query contract, in one place.
// The results list's suspense read and the SearchView story's cache seed both share it.
// So the key can never drift.
// A seed under a divergent key would silently miss, and the story would hit the network instead of rendering the state it exists to show.
// Latitude and longitude are quantized to 2 decimal places, so small map moves do not refetch.
// The locale keys the localized titles.
// Sort is deliberately absent, since it is presentation, re-applied client-side.
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
  // This query makes no request.
  // It re-derives the list from the already-cached feed: the full-feed predicate, a zod parse per surviving event, and a distance sort.
  // With React Query's default `staleTime: 0`, every drawer remount redid all of that work against bytes that could not have changed.
  // So this stays fresh for as long as the feed it derives from does.
  // The gc window is twice that, so an entry cannot drop before it even goes stale. See `EVENTS_STALE_TIME`.
  staleTime: EVENTS_STALE_TIME,
  gcTime: EVENTS_GC_TIME,
})

// This is the localized titles sliver's contract.
// It is declared in `fetch.ts`, beside the fetcher it wraps.
// Declaring it here instead would close an import cycle, since this module imports that one.
// This re-exports it here with the rest, so callers still find every factory in one place.
export { eventTitlesQuery } from './fetch'

// This is the wholesale region-tree query contract, in one place.
// The region matcher, the Region filter's options, and the region-pill name lookup all share it.
// So the key, fetcher, and stale window can never drift.
// Region names carry no locale, so the tree stays locale-agnostic, and this key carries no locale.
export const regionsQuery = () => ({
  queryKey: ['regions'] as const,
  queryFn: () => api.getRegions(),
  staleTime: REGIONS_STALE_TIME,
  // This is pinned because the default `gcTime`, 5 minutes, is SHORTER than the stale window above.
  // The tree could be evicted while still nominally fresh.
  // Every navigation after an idle gap would then re-read the whole of `/regions`. See `WHOLESALE_GC_TIME`.
  // `loadRegions` in `./fetch` spells the same four options for the imperative read.
  // Change that copy together with this one.
  gcTime: WHOLESALE_GC_TIME,
})

export default api
