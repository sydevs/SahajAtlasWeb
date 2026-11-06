import type { EventSchedule, FeedEvent, GeoFeature } from '@/types'
import type { Position } from 'geojson'

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
  type RegionMatcher,
} from './filters'
import { type PlaceScope, localResults, nearPlace } from './sections'

import { distanceKm } from '@/lib/geo'

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

/**
 * Which of the classes that pass a set of filters the results would list. Every one of them by
 * default. A searched place passes `localResults`, since whether a class counts there can depend
 * on which others pass (an area measures its neighbours from its own classes).
 */
export type ShownOf<T> = (passing: T[]) => T[]

const countPassing = <T extends FacetEvent>(
  events: readonly T[],
  filters: EventFilters,
  today: string,
  shownOf?: ShownOf<T>,
): number => {
  if (!shownOf) {
    return events.reduce((sum, event) => (passes(event, filters, today) ? sum + 1 : sum), 0)
  }

  return shownOf(events.filter((event) => passes(event, filters, today))).length
}

type ScopedEvent = GeoFeature['properties'] & { distance?: number }

/**
 * The feed as the filter counts read it: the region's classes, less the one a "see alternatives"
 * search leaves out (as the list does), each with its distance from the searched point. Around a
 * point it keeps only what could be listed in full, and `shownOf` says which of those that pass
 * the list shows, by the list's own split.
 */
export const facetScope = (
  features: readonly GeoFeature[],
  {
    center,
    place,
    excluded,
    matchesRegion,
  }: {
    center?: Position
    place: PlaceScope
    excluded?: number
    matchesRegion?: RegionMatcher | null
  },
): { events: ScopedEvent[]; shownOf?: ShownOf<ScopedEvent> } => {
  const events = features.flatMap((feature): ScopedEvent[] =>
    (matchesRegion && !matchesRegion(feature.properties)) || feature.properties.id === excluded
      ? []
      : [
          {
            ...feature.properties,
            distance:
              center && feature.geometry
                ? distanceKm(center, feature.geometry.coordinates)
                : undefined,
          },
        ],
  )

  if (!center) return { events }

  return {
    events: nearPlace(events, place),
    shownOf: (passing) => localResults(passing, place),
  }
}

/** Counts every option of every group against `filters`. */
export const facetCounts = <T extends FacetEvent>(
  events: readonly T[],
  filters: EventFilters,
  today: string = todayISO(),
  shownOf?: ShownOf<T>,
): FacetCounts => {
  const count = (next: Partial<EventFilters>) =>
    countPassing(events, { ...filters, ...next }, today, shownOf)

  // Only the languages of classes the results would list, so no option offers a language that
  // only a class past the place's reach speaks.
  const codes = new Set(
    (shownOf ? shownOf([...events]) : events).flatMap((event) => event.languages),
  )

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
export const bestRecovery = <T extends FacetEvent>(
  events: readonly T[],
  filters: EventFilters,
  today: string = todayISO(),
  shownOf?: ShownOf<T>,
): FilterRecovery | null => {
  const candidates: Pick<FilterRecovery, 'group' | 'patch'>[] = []

  if (filters.format !== 'any') candidates.push({ group: 'format', patch: { format: 'any' } })
  if (filters.daysOfWeek.length > 0) candidates.push({ group: 'days', patch: { daysOfWeek: [] } })
  if (filters.timeOfDay.length > 0) candidates.push({ group: 'time', patch: { timeOfDay: [] } })
  if (filters.cadence !== 'any') candidates.push({ group: 'cadence', patch: { cadence: 'any' } })
  if (filters.languages.length > 0)
    candidates.push({ group: 'languages', patch: { languages: [] } })
  if (isDateRestricted(filters.dateRange)) {
    candidates.push({ group: 'dates', patch: { dateRange: { start: null, end: null } } })
  }

  return candidates.reduce<FilterRecovery | null>((best, candidate) => {
    const count = countPassing(events, { ...filters, ...candidate.patch }, today, shownOf)

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
