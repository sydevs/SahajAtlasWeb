import type { DateRange, EventCadence, EventFilters, EventFormat, TimePeriod } from '@/lib/shape'

import { useMemo } from 'react'
import { useLocation, useSearchParams } from 'react-router'

import { DEFAULT_FILTERS, filtersFromParams, filtersToParams, resetReveal } from '@/lib/shape'

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
 * rest (`q`/`bbox`/`center`). Used by the results' quick-edit pills; `setFilters`
 * commits a whole set. `replace` so tweaking a filter doesn't stack a history entry.
 *
 * The list's reveal (`?shown=`/`?all=1`) is explicitly RESET rather than preserved: a
 * filter change is a change to which events match, so a count carried over from the
 * previous result set is meaningless. It needs saying here because this merges onto
 * `prev` — a new place search drops both for free (`preserveSearchState` re-encodes
 * from an empty base).
 */
export const useSetFilters = () => {
  const [, setSearchParams] = useSearchParams()
  const location = useLocation()

  // Read the *current* filters from `prev` inside the updater (not a render-time
  // snapshot), so a concurrent change can't be clobbered.
  const update = (change: (filters: EventFilters) => EventFilters) =>
    // Both codecs copy the base they're given, so `prev` goes in as-is — no defensive
    // `new URLSearchParams(prev)` between them. `state` is carried explicitly: a
    // `replace` without it strips the entry's `atlasDepth` and breaks the drawer's
    // history-aware dismissal (see `use-reveal`).
    setSearchParams((prev) => filtersToParams(change(filtersFromParams(prev)), resetReveal(prev)), {
      replace: true,
      state: location.state,
    })

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
