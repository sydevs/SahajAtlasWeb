import type { EventFilters } from '@/lib/shape'

import fetch, { ATLAS_CONFIG_STALE_TIME } from './fetch'
import mutate from './mutate'

import { EVENTS_GC_TIME, EVENTS_STALE_TIME, WHOLESALE_GC_TIME } from '@/config/query-client'
import { filtersKey, hasActiveFilters } from '@/lib/shape'

const api = {
  ...fetch,
  ...mutate,
}

// This is the client-record query contract, in one place.
// AppRouter's suspense read and BrandTheme's non-suspense read both share it.
// So the key and fetcher can never drift between them.
// Session-long: `ClientGate` mounts a reader with every view, and a record that changes in the
// admin a few times a year is not worth a request per navigation.
export const clientQuery = (apiKey?: string | null) => ({
  queryKey: ['client', apiKey] as const,
  queryFn: () => api.getClient(),
  staleTime: ATLAS_CONFIG_STALE_TIME,
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

// This is the single-region query contract, in one place.
// RegionView's suspense read, OnlineView's re-read of the same parent, and the live-preview overlay all share it.
// So the key and fetcher can never drift.
// Locale is part of the key, since a region's name and subtitle are localized.
// ⚠ A writer under a divergent key is SILENT: `setQueryData` creates the entry it was handed and no reader ever asks for it.
// That is how live preview shipped writing `['region', slug]` while the drawer read `['region', slug, locale]`, and no live edit rendered.
// Filters join the key only when active, so the plain key every writer above relies on stays as it is.
export const regionQuery = (slug: string, locale: string, filters?: EventFilters) => ({
  queryKey:
    filters && hasActiveFilters(filters)
      ? (['region', slug, locale, filtersKey(filters)] as const)
      : (['region', slug, locale] as const),
  queryFn: () => api.getRegion(slug, filters),
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

// These are the contracts of the three wholesale caches, the feed, the region tree, and the localized titles sliver, plus the country list the boot warm-up shares.
// Each is declared in `fetch.ts`, beside the fetcher it wraps and the loader or warm-up that consumes it.
// Declaring one here instead would close an import cycle, since this module imports that one.
// This re-exports them here with the rest, so callers still find every factory in one place.
export { countriesQuery, eventTitlesQuery, geojsonQuery, regionsQuery } from './fetch'

// This is the authored report form's contract, in one place.
// The modal host's warm read and the panel's suspending read inside the boundary both share it, so the key can never drift.
// It shares `atlasConfigQuery`'s windows: this is operator-authored copy on a human editing cadence, read once per session at most.
// `retryOnMount: false` matters here too, since the host observes this for the widget's whole life.
// A failed read must not re-fire on every remount of a form nobody has opened.
// `useSuspenseQuery`'s options omit `enabled`, because a suspending read cannot be switched off, so the suspending variant is this contract without that one key.
export const reportFormSuspenseQuery = (id: number) => ({
  queryKey: ['report-form', id] as const,
  queryFn: () => api.getReportForm(id),
  staleTime: ATLAS_CONFIG_STALE_TIME,
  gcTime: WHOLESALE_GC_TIME,
  retryOnMount: false,
})

// A `null` id — no form named, or a config not read yet — keys its own entry and carries `enabled: false`.
// So "no form" never shares a key with a real one, and the cast is unreachable while that holds.
export const reportFormQuery = (id: number | null) => ({
  ...reportFormSuspenseQuery(id as number),
  enabled: id !== null,
})

export default api
