import type { EventSchedule, FeedEvent } from '@/types'

import { DateTime } from 'luxon'

import { eventTimeZone } from './event'
import {
  DEFAULT_FILTERS,
  type EventCadence,
  type EventFilters,
  type TimePeriod,
  TIME_PERIODS,
  dateFloor,
  isDateRestricted,
  isTimeRestricted,
  matchesFilters,
  occurrenceMatchesFilters,
  todayISO,
} from './filters'

/**
 * What each filter can still do in the current scope: how many classes every option would
 * leave, and which whole groups could change the results at all. The filter form reads this to
 * show live counts and to drop the groups that would be noise here (one language in this
 * country means no language question).
 *
 * The events passed in are already cut to the scope (the world, a region, or the area around a
 * searched place), so the region filter is not consulted again.
 */

type FacetEvent = Pick<FeedEvent, 'eventType' | 'languages'> & {
  schedule?: EventSchedule | null
}

const CADENCES = ['DAILY', 'WEEKLY', 'MONTHLY', 'once'] as const
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

// Converting a stored date into the event's zone is the one expensive step in the predicate, and
// a facet pass needs the answer about thirty times per event. One conversion per occurrence,
// cached against the feed's own objects, keeps a tap well under a frame's worth of work.
const occurrenceCache = new WeakMap<object, DateTime[]>()

const localOccurrences = (event: FacetEvent): DateTime[] => {
  const cached = occurrenceCache.get(event)

  if (cached) return cached

  const zone = eventTimeZone(event)
  const local = (event.schedule?.upcomingDates ?? []).map((date) =>
    DateTime.fromJSDate(date, { zone }),
  )

  occurrenceCache.set(event, local)

  return local
}

const NO_REGION_OR_TIME = {
  daysOfWeek: [],
  timeOfDay: [],
  dateRange: { start: null, end: null },
  region: null,
}

/** The same answer as `matchesFilters`, over the cached occurrences. */
const passes = (event: FacetEvent, filters: EventFilters, today: string): boolean => {
  if (!matchesFilters(event, { ...filters, ...NO_REGION_OR_TIME }, today)) return false

  const occurrenceBound =
    filters.daysOfWeek.length > 0 ||
    isTimeRestricted(filters.timeOfDay) ||
    isDateRestricted(filters.dateRange)

  if (!occurrenceBound) return true

  const floor = dateFloor(filters, today)

  return localOccurrences(event).some((local) => occurrenceMatchesFilters(local, filters, floor))
}

/** Counts every option of every group against `filters`. */
export const facetCounts = (
  events: readonly FacetEvent[],
  filters: EventFilters,
  today: string = todayISO(),
): FacetCounts => {
  const count = (next: Partial<EventFilters>) => {
    const candidate = { ...filters, ...next }

    return events.reduce((sum, event) => (passes(event, candidate, today) ? sum + 1 : sum), 0)
  }

  const codes = new Set<string>()

  events.forEach((event) => event.languages.forEach((code) => codes.add(code)))

  return {
    total: count({}),
    format: { offline: count({ format: 'offline' }), online: count({ format: 'online' }) },
    days: Object.fromEntries(DAYS.map((day) => [day, count({ daysOfWeek: [day] })])),
    time: Object.fromEntries(
      TIME_PERIODS.map((period) => [period, count({ timeOfDay: [period] })]),
    ) as FacetCounts['time'],
    cadence: Object.fromEntries(
      CADENCES.map((cadence) => [cadence, count({ cadence })]),
    ) as FacetCounts['cadence'],
    languages: [...codes]
      .map((code) => ({ code, count: count({ languages: [code] }) }))
      .sort((a, b) => b.count - a.count),
  }
}

/** One group the visitor has answered, and how many classes come back if it's removed. */
export type FilterRecovery = {
  group: 'format' | 'days' | 'time' | 'cadence' | 'languages' | 'dates'
  count: number
  patch: Partial<EventFilters>
}

/**
 * The most useful single way out of an empty result: the answered group whose removal brings back
 * the most classes. `null` when removing any one of them still leaves nothing.
 */
export const bestRecovery = (
  events: readonly FacetEvent[],
  filters: EventFilters,
  today: string = todayISO(),
): FilterRecovery | null => {
  const candidates: Pick<FilterRecovery, 'group' | 'patch'>[] = []

  if (filters.format !== 'any') candidates.push({ group: 'format', patch: { format: 'any' } })
  if (filters.daysOfWeek.length > 0) candidates.push({ group: 'days', patch: { daysOfWeek: [] } })
  if (filters.timeOfDay.length > 0) candidates.push({ group: 'time', patch: { timeOfDay: [] } })
  if (filters.cadence !== 'any') candidates.push({ group: 'cadence', patch: { cadence: 'any' } })
  if (filters.languages.length > 0) candidates.push({ group: 'languages', patch: { languages: [] } })
  if (isDateRestricted(filters.dateRange)) {
    candidates.push({ group: 'dates', patch: { dateRange: { start: null, end: null } } })
  }

  return candidates.reduce<FilterRecovery | null>((best, candidate) => {
    const next = { ...filters, ...candidate.patch }
    const count = events.reduce((sum, event) => (passes(event, next, today) ? sum + 1 : sum), 0)

    return count > (best?.count ?? 0) ? { ...candidate, count } : best
  }, null)
}

export type FacetRelevance = {
  format: boolean
  days: boolean
  time: boolean
  cadence: boolean
  languages: boolean
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
    languages: narrows(scope.languages.map((language) => language.count)),
  }
}

/** The scope's own relevance, with nothing filtered. */
export const scopeRelevance = (events: readonly FacetEvent[], today?: string): FacetRelevance =>
  facetRelevance(facetCounts(events, DEFAULT_FILTERS, today))
