import type { DateRange, EventCadence, EventFilters, EventFormat } from '@/lib/shape'

import { useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { DEFAULT_FILTERS, filtersFromParams, filtersToParams } from '@/lib/shape'

// The applied event filters live in the URL query — the single source of truth, so
// a filtered view is linkable/shareable and the map + list always agree on it. Read
// with `useEventFilters`; mutate the /search flow's filters with `useSetFilters`.

/**
 * Applied filters parsed from the URL query. Re-derives on any query change
 * (including `?q`/`?bbox`/`?center`/`?all`), but that's off the map's true hot path:
 * pan/zoom writes the camera to zustand, never the URL, so those don't churn this.
 */
export const useEventFilters = (): EventFilters => {
  const [searchParams] = useSearchParams()

  return useMemo(() => filtersFromParams(searchParams), [searchParams])
}

/**
 * Filter setters that rewrite the current URL's filter params while preserving the
 * rest (`q`/`bbox`/`center`/`all`). Used by the results' quick-edit pills; `setFilters`
 * commits a whole set. `replace` so tweaking a filter doesn't stack a history entry.
 */
export const useSetFilters = () => {
  const [, setSearchParams] = useSearchParams()

  // Read the *current* filters from `prev` inside the updater (not a render-time
  // snapshot), so a concurrent change can't be clobbered.
  const update = (change: (filters: EventFilters) => EventFilters) =>
    setSearchParams(
      (prev) => filtersToParams(change(filtersFromParams(prev)), new URLSearchParams(prev)),
      { replace: true },
    )

  return {
    setFilters: (filters: EventFilters) => update(() => filters),
    setFormat: (format: EventFormat) => update((filters) => ({ ...filters, format })),
    setCadence: (cadence: EventCadence) => update((filters) => ({ ...filters, cadence })),
    setTimeOfDay: (timeOfDay: [number, number]) => update((filters) => ({ ...filters, timeOfDay })),
    setDaysOfWeek: (daysOfWeek: number[]) => update((filters) => ({ ...filters, daysOfWeek })),
    setLanguages: (languages: string[]) => update((filters) => ({ ...filters, languages })),
    setDateRange: (dateRange: DateRange) => update((filters) => ({ ...filters, dateRange })),
    clearFilters: () => update(() => DEFAULT_FILTERS),
  }
}
