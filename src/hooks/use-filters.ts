import type { EventCadence, EventFilters, EventFormat } from '@/lib/shape'

import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { DEFAULT_FILTERS, filtersFromParams, filtersToParams } from '@/lib/shape'

// The applied event filters live in the URL query — the single source of truth, so
// a filtered view is linkable/shareable and the map + list always agree on it. Read
// with `useEventFilters`; mutate the /search flow's filters with `useSetFilters`.

/**
 * Applied filters parsed from the URL query. Memoized on the *filter-only* query so
 * the identity is stable while the filters are unchanged — the map's hot path
 * depends on this (a `?q`/`?all`/`?center` edit must not churn the filters object).
 */
export const useEventFilters = (): EventFilters => {
  const [searchParams] = useSearchParams()
  // Canonical filter-only query: round-tripping drops unrelated params and normalizes
  // order, so the string only changes when a filter value actually changes.
  const query = filtersToParams(filtersFromParams(searchParams)).toString()

  return useMemo(() => filtersFromParams(new URLSearchParams(query)), [query])
}

/**
 * In-place filter setters that rewrite the current URL's filter params while
 * preserving the rest (`q`/`bbox`/`center`/`all`). Used by the results' quick-edit
 * pills; `setFilters` commits a whole set. `replace` so tweaking a filter doesn't
 * stack a history entry per keystroke.
 */
export const useSetFilters = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const current = filtersFromParams(searchParams)

  const setFilters = useCallback(
    (filters: EventFilters) =>
      setSearchParams((prev) => filtersToParams(filters, new URLSearchParams(prev)), {
        replace: true,
      }),
    [setSearchParams],
  )

  return {
    setFilters,
    setFormat: (format: EventFormat) => setFilters({ ...current, format }),
    setCadence: (cadence: EventCadence) => setFilters({ ...current, cadence }),
    setTimeOfDay: (timeOfDay: [number, number]) => setFilters({ ...current, timeOfDay }),
    setDaysOfWeek: (daysOfWeek: number[]) => setFilters({ ...current, daysOfWeek }),
    setLanguages: (languages: string[]) => setFilters({ ...current, languages }),
    clearFilters: () => setFilters(DEFAULT_FILTERS),
  }
}
