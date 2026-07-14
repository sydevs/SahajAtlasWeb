import type { EventCadence, EventFilters, EventFormat } from '@/lib/shape'

import { useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { DEFAULT_FILTERS, filtersFromParams, filtersToParams } from '@/lib/shape'

// The applied event filters live in the URL query — the single source of truth, so
// a filtered view is linkable/shareable and the map + list always agree on it. Read
// with `useEventFilters`; mutate the /search flow's filters with `useSetFilters`.

/**
 * Applied filters parsed from the URL query. `useSearchParams` memoizes its result
 * on `location.search`, and the map camera lives in zustand (pan/zoom never touches
 * the URL), so this identity is stable across the map's hot path and only
 * re-derives when the query actually changes.
 */
export const useEventFilters = (): EventFilters => {
  const [searchParams] = useSearchParams()

  return useMemo(() => filtersFromParams(searchParams), [searchParams])
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

  const setFilters = (filters: EventFilters) =>
    setSearchParams((prev) => filtersToParams(filters, new URLSearchParams(prev)), {
      replace: true,
    })

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
