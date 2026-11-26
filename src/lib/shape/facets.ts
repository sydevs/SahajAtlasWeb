import {
  DEFAULT_FILTERS,
  EVENT_CADENCES,
  type EventCadence,
  type EventFilters,
  type FilterableEvent,
  type TimePeriod,
  TIME_PERIODS,
  matchesFilters,
  todayISO,
} from './filters'

/**
 * What each filter can still do in the current scope: how many classes every option would
 * leave, and which whole groups could change the results at all. The filter form reads this to
 * show live counts and to drop the questions that would be noise here.
 *
 * The events passed in are already cut to the scope (the world, a region, or the area around a
 * searched place), so the region filter is not consulted again. Every count goes through
 * `matchesFilters`, the predicate the list and the map apply, so the numbers cannot drift from
 * what Apply then shows.
 */

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const

export type FacetCounts = {
  /** Classes that match every current filter. */
  total: number
  /** Each count below: that option selected on its own, with every OTHER group still applied. */
  format: { offline: number; online: number }
  days: Record<number, number>
  time: Record<TimePeriod, number>
  cadence: Record<Exclude<EventCadence, 'any'>, number>
  /** Most-used language first. */
  languages: { code: string; count: number }[]
}

/** Counts every option of every group against `filters`. */
export const facetCounts = (
  events: readonly FilterableEvent[],
  filters: EventFilters,
  today: string = todayISO(),
): FacetCounts => {
  const count = (next: Partial<EventFilters>) => {
    const candidate = { ...filters, ...next, region: null }

    return events.reduce(
      (sum, event) => (matchesFilters(event, candidate, today) ? sum + 1 : sum),
      0,
    )
  }

  const codes = new Set(events.flatMap((event) => event.languages))

  return {
    total: count({}),
    format: { offline: count({ format: 'offline' }), online: count({ format: 'online' }) },
    days: Object.fromEntries(DAYS.map((day) => [day, count({ daysOfWeek: [day] })])),
    time: Object.fromEntries(
      TIME_PERIODS.map((period) => [period, count({ timeOfDay: [period] })]),
    ) as FacetCounts['time'],
    cadence: Object.fromEntries(
      EVENT_CADENCES.map((cadence) => [cadence, count({ cadence })]),
    ) as FacetCounts['cadence'],
    languages: [...codes]
      .map((code) => ({ code, count: count({ languages: [code] }) }))
      .sort((a, b) => b.count - a.count),
  }
}

export type FacetRelevance = {
  format: boolean
  days: boolean
  time: boolean
  cadence: boolean
}

/**
 * Which groups could change the results in this scope. A group earns its place when at least
 * one option would leave some classes, but not all of them. So a town whose classes are all on
 * Tuesday asks nothing about days.
 *
 * Judged on the scope alone, never on the other filters already picked. Otherwise tapping
 * "Online" could remove the Day group from under the visitor's thumb, and the form would jump.
 */
export const facetRelevance = (scope: FacetCounts): FacetRelevance => {
  const narrows = (counts: number[]) => counts.some((n) => n > 0 && n < scope.total)

  return {
    format: narrows(Object.values(scope.format)),
    days: narrows(Object.values(scope.days)),
    time: narrows(Object.values(scope.time)),
    cadence: narrows(Object.values(scope.cadence)),
  }
}

/** The live counts behind the filter form, and the scope's own relevance. */
export type FilterFacets = {
  counts: FacetCounts
  relevance: FacetRelevance
}

/** The scope's own counts and relevance, with nothing filtered. */
export const scopeFacets = (events: readonly FilterableEvent[], today?: string): FilterFacets => {
  const counts = facetCounts(events, DEFAULT_FILTERS, today)

  return { counts, relevance: facetRelevance(counts) }
}

/**
 * Which questions the filter form asks: a group that could narrow this scope, or one already
 * answered, so it can always be undone. With no counts yet, every group but Language shows.
 *
 * Language shows wherever the scope's classes have a language, even only one, because then it
 * says which language the classes are in.
 */
export const shownGroups = (filters: EventFilters, facets: FilterFacets | undefined) => ({
  format: filters.format !== 'any' || (facets?.relevance.format ?? true),
  days: filters.daysOfWeek.length > 0 || (facets?.relevance.days ?? true),
  time: filters.timeOfDay.length > 0 || (facets?.relevance.time ?? true),
  cadence: filters.cadence !== 'any' || (facets?.relevance.cadence ?? true),
  languages: filters.languages.length > 0 || (facets?.counts.languages.length ?? 0) > 0,
})
