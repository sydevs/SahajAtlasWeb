import {
  DEFAULT_FILTERS,
  EVENT_CADENCES,
  type EventCadence,
  type EventFilters,
  type FilterableEvent,
  type TimePeriod,
  TIME_PERIODS,
  isDateRestricted,
  isTimeless,
  matchesFilters,
  todayISO,
} from './filters'
import { isOnline } from './event'

/**
 * What each filter can still do in the current scope: how many classes every option would
 * leave, and which whole groups could change the results at all. The filter form reads this to
 * show live counts and to drop the questions that would be noise here.
 *
 * The events passed in are already cut to the scope (the world, a region, or the area around a
 * searched place), so the region filter is not consulted again. Every count goes through
 * `matchesFilters`, the predicate the list and the map apply, so the numbers cannot drift from
 * what the list then shows.
 */

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const

export type FacetCounts = {
  /** Classes that match every current filter. */
  total: number
  /** Each count below: that option selected on its own, with every OTHER group still applied. */
  format: { offline: number; online: number }
  days: Record<number, number>
  time: Record<TimePeriod, number>
  /** Of the classes each time of day counts, those that name no times, and so count in all four. */
  timeless: number
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
  const anyTime = { ...filters, timeOfDay: [], region: null }

  return {
    total: count({}),
    format: { offline: count({ format: 'offline' }), online: count({ format: 'online' }) },
    days: Object.fromEntries(DAYS.map((day) => [day, count({ daysOfWeek: [day] })])),
    time: Object.fromEntries(
      TIME_PERIODS.map((period) => [period, count({ timeOfDay: [period] })]),
    ) as FacetCounts['time'],
    timeless: events.reduce(
      (sum, event) => (isTimeless(event) && matchesFilters(event, anyTime, today) ? sum + 1 : sum),
      0,
    ),
    cadence: Object.fromEntries(
      EVENT_CADENCES.map((cadence) => [cadence, count({ cadence })]),
    ) as FacetCounts['cadence'],
    languages: [...codes]
      .map((code) => ({ code, count: count({ languages: [code] }) }))
      .sort((a, b) => b.count - a.count),
  }
}

/** One answered question, and how many classes come back once it is removed. */
export type FilterRecovery = {
  group: 'format' | 'days' | 'time' | 'cadence' | 'languages' | 'dates'
  count: number
  patch: Partial<EventFilters>
}

/**
 * The one change that brings back the most classes when nothing matches: the answered question
 * whose removal leaves the most. `null` when removing any single one still leaves nothing, so
 * clearing everything is the only way out.
 */
export const bestRecovery = (
  events: readonly FilterableEvent[],
  filters: EventFilters,
  today: string = todayISO(),
): FilterRecovery | null => {
  const candidates: Pick<FilterRecovery, 'group' | 'patch'>[] = [
    filters.format !== 'any' && { group: 'format' as const, patch: { format: 'any' as const } },
    filters.daysOfWeek.length > 0 && { group: 'days' as const, patch: { daysOfWeek: [] } },
    filters.timeOfDay.length > 0 && { group: 'time' as const, patch: { timeOfDay: [] } },
    filters.cadence !== 'any' && { group: 'cadence' as const, patch: { cadence: 'any' as const } },
    filters.languages.length > 0 && { group: 'languages' as const, patch: { languages: [] } },
    isDateRestricted(filters.dateRange) && {
      group: 'dates' as const,
      patch: { dateRange: { start: null, end: null } },
    },
  ].filter((candidate) => candidate !== false)

  return candidates.reduce<FilterRecovery | null>((best, candidate) => {
    const next = { ...filters, ...candidate.patch, region: null }
    const count = events.reduce(
      (sum, event) => (matchesFilters(event, next, today) ? sum + 1 : sum),
      0,
    )

    return count > (best?.count ?? 0) ? { ...candidate, count } : best
  }, null)
}

/**
 * The in-person classes in scope that the filters hide: exactly what clearing them brings back
 * to the area. Online classes are left out, since they belong to no area.
 */
export const hiddenInPerson = (
  events: readonly FilterableEvent[],
  filters: EventFilters,
  today: string = todayISO(),
): number => {
  const applied = { ...filters, region: null }

  return events.reduce(
    (sum, event) => (!isOnline(event) && !matchesFilters(event, applied, today) ? sum + 1 : sum),
    0,
  )
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
  /** The way out when nothing matches (`bestRecovery`); absent while something does. */
  recovery?: FilterRecovery | null
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

/**
 * `shownGroups`' Where and Language answers, judged on the scope without counting it, for the
 * closed filter buttons, which need nothing else: whether the scope mixes online and in-person
 * classes, and whether any of its classes has a language. Unlike `shownGroups` before the counts
 * arrive, an empty scope (the feed still loading) offers neither, so the buttons wait for it.
 */
export const scopeOffers = (filters: EventFilters, events: readonly FilterableEvent[]) => ({
  format:
    filters.format !== 'any' || (events.some(isOnline) && events.some((event) => !isOnline(event))),
  languages: filters.languages.length > 0 || events.some((event) => event.languages?.length),
})
