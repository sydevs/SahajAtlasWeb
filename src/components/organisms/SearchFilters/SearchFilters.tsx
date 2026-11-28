import { type ReactNode } from 'react'

import { DayFilter, FormatFilter, LanguageFilter, MoreFilters, TimeFilter } from './filter-blocks'

import { type EventFilters, type FilterFacets } from '@/lib/shape'

export type SearchFiltersProps = {
  /** The filter values the form edits. */
  value: EventFilters
  /** Called with the next filters on every change. */
  onChange: (filters: EventFilters) => void
  /** The Where group, which needs the router and the geocoder, so the view supplies it. */
  where?: ReactNode
  /** Live counts and relevance. Without them every group but Language shows, with no numbers. */
  facets?: FilterFacets
}

/**
 * The whole event-filters form, in the order a visitor decides: where, online or in person, day,
 * time of day, language, then Frequency and Dates under "More filters". It composes the same
 * blocks the filter buttons on a computer split between their menus (`filter-blocks.tsx`), so the
 * two always ask alike. Fully controlled: it edits `value` and reports every change.
 *
 * A question that cannot change the results in this scope is not asked, unless it is already
 * answered (`shownGroups`).
 */
export function SearchFilters({ value, onChange, where, facets }: SearchFiltersProps) {
  const block = {
    value,
    facets,
    patch: (next: Partial<EventFilters>) => onChange({ ...value, ...next }),
  }

  return (
    <div className="flex flex-col gap-5">
      {where}
      <FormatFilter {...block} />
      <DayFilter {...block} />
      <TimeFilter {...block} />
      <LanguageFilter {...block} />
      <MoreFilters {...block} />
    </div>
  )
}
