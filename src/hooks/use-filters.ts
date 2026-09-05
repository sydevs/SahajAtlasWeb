import type { DateRange, EventCadence, EventFilters, EventFormat, TimePeriod } from '@/lib/shape'

import { useMemo } from 'react'
import { useLocation, useSearchParams } from 'react-router'

import { DEFAULT_FILTERS, filtersFromParams, filtersToParams } from '@/lib/shape'

// The applied event filters live in the URL query, the single source of truth.
// So a filtered view is linkable and shareable, and the map and list always agree on it.
// Read them with `useEventFilters`. Mutate the `/search` flow's filters with `useSetFilters`.

/**
 * These are applied filters, parsed from the URL query.
 * This re-derives on any query change, including `?q`, `?bbox`, and `?center`.
 * That is off the map's true hot path.
 * Pan and zoom write the camera to zustand, never to the URL, so those never churn this.
 */
export const useEventFilters = (): EventFilters => {
  const [searchParams] = useSearchParams()

  return useMemo(() => filtersFromParams(searchParams), [searchParams])
}

/**
 * These are filter setters. They rewrite the current URL's filter params, while preserving the rest, `q`, `bbox`, and `center`.
 * The results' quick-edit pills use these. `setFilters` commits a whole set.
 * This uses `replace`, so tweaking a filter does not stack a history entry.
 *
 * The results list's reveal resets with any of these, with no reset call here.
 * The filters are part of `revealKey`, so an edited set simply is not the result set the stored count belongs to. See `use-reveal`.
 */
export const useSetFilters = () => {
  const [, setSearchParams] = useSearchParams()
  const location = useLocation()

  // This reads the CURRENT filters from `prev` inside the updater, not a render-time snapshot.
  // So a concurrent change cannot get clobbered.
  const update = (change: (filters: EventFilters) => EventFilters) =>
    // This carries `state` explicitly.
    // A `replace` without it would strip the entry's `atlasDepth` and break the drawer's history-aware dismissal.
    setSearchParams(
      (prev) => filtersToParams(change(filtersFromParams(prev)), new URLSearchParams(prev)),
      { replace: true, state: location.state },
    )

  return {
    setFilters: (filters: EventFilters) => update(() => filters),
    setFormat: (format: EventFormat) => update((filters) => ({ ...filters, format })),
    setCadence: (cadence: EventCadence) => update((filters) => ({ ...filters, cadence })),
    setTimeOfDay: (timeOfDay: TimePeriod[]) => update((filters) => ({ ...filters, timeOfDay })),
    setDaysOfWeek: (daysOfWeek: number[]) => update((filters) => ({ ...filters, daysOfWeek })),
    setLanguages: (languages: string[]) => update((filters) => ({ ...filters, languages })),
    setDateRange: (dateRange: DateRange) => update((filters) => ({ ...filters, dateRange })),
    setRegion: (region: string | null) => update((filters) => ({ ...filters, region })),
    clearFilters: () => update(() => DEFAULT_FILTERS),
  }
}
