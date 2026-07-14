import type { EventSchedule, EventType, FeedEvent } from '@/types'

import { DateTime } from 'luxon'

import { eventTimeZone } from './event'

/**
 * The event-filter model, shared by the SearchFilters panel, the URL filter codec
 * (`filtersToParams`/`filtersFromParams`), the events list, and the map.
 * `matchesFilters` is the single predicate both the list and the map apply, so a
 * filtered list and the filtered pins/clusters always agree.
 *
 * All fields have a "no restriction" default (`DEFAULT_FILTERS`); with every
 * field at its default, `matchesFilters` passes every event.
 */

/** Event format filter — `any`, or one of the `eventType` values. */
export type EventFormat = 'any' | EventType

/**
 * Event cadence filter, derived from `schedule.recurrenceType`. `once` matches
 * events with no recurrence (a null `recurrenceType`); `WEEKLY`/`MONTHLY` match
 * that recurrence directly.
 */
export type EventCadence = 'any' | 'once' | 'DAILY' | 'WEEKLY' | 'MONTHLY'

/** Time-of-day range bounds (hours), and the step used by the slider. */
export const TIME_MIN = 0
export const TIME_MAX = 24
export const TIME_STEP = 0.5

/** How far ahead the date-range filter reaches from today — bounds the picker and the URL clamp. */
export const DATE_WINDOW_MONTHS = 12

/**
 * A calendar-date window: each bound an independent `yyyy-MM-dd` string, or `null`
 * for an open side. `{ start: null, end: null }` = no restriction.
 */
export type DateRange = { start: string | null; end: string | null }

export type EventFilters = {
  format: EventFormat
  /** [earliest, latest] local start hour, 0–24. `[0, 24]` = no restriction. */
  timeOfDay: [number, number]
  /** Luxon weekday numbers, 1 (Mon)–7 (Sun). Empty = no restriction. */
  daysOfWeek: number[]
  /** Language codes; an event matches if it offers any selected language. Empty = no restriction. */
  languages: string[]
  cadence: EventCadence
  /** Keep only events with an upcoming occurrence in this calendar-date window. */
  dateRange: DateRange
}

export const DEFAULT_FILTERS: EventFilters = {
  format: 'any',
  timeOfDay: [TIME_MIN, TIME_MAX],
  daysOfWeek: [],
  languages: [],
  cadence: 'any',
  dateRange: { start: null, end: null },
}

// Freeze the singleton and its arrays so the store can safely seed/clear by
// aliasing these references — nothing can mutate the shared default in place.
Object.freeze(DEFAULT_FILTERS.timeOfDay)
Object.freeze(DEFAULT_FILTERS.daysOfWeek)
Object.freeze(DEFAULT_FILTERS.languages)
Object.freeze(DEFAULT_FILTERS.dateRange)
Object.freeze(DEFAULT_FILTERS)

/** Whether the time-of-day range narrows anything (i.e. isn't the full day). */
export const isTimeRestricted = (timeOfDay: [number, number]): boolean =>
  timeOfDay[0] !== TIME_MIN || timeOfDay[1] !== TIME_MAX

/** Whether the date range narrows anything (i.e. either bound is set). */
export const isDateRestricted = (dateRange: DateRange): boolean =>
  dateRange.start !== null || dateRange.end !== null

/**
 * The selectable date window — today through today + `DATE_WINDOW_MONTHS`, as
 * `yyyy-MM-dd` in the viewer's local zone. It bounds the picker inputs and clamps
 * the URL codec, so a hand-crafted link can't select outside the window.
 */
export const dateWindow = (): { min: string; max: string } => {
  const today = DateTime.now().startOf('day')

  return {
    min: today.toISODate() ?? '',
    max: today.plus({ months: DATE_WINDOW_MONTHS }).toISODate() ?? '',
  }
}

/** The subset of an event `matchesFilters` needs — so it works for `FeedEvent`, `EventSlim`, and `Event`. */
type FilterableEvent = Pick<FeedEvent, 'eventType' | 'languages'> & {
  schedule?: EventSchedule | null
}

/**
 * Does an event pass the given filters? Pure and timezone-correct:
 *
 * - **Day, time, and date range are evaluated together, per occurrence.** An event
 *   matches only if some `schedule.upcomingDates` occurrence falls on a selected
 *   weekday *and* starts within the time range *and* lands in the date window — a
 *   Monday-morning and a Wednesday-evening occurrence don't combine to satisfy
 *   "Wednesday morning", nor a Jul-20 and a Jul-27 occurrence to satisfy a
 *   single-day range.
 * - Each occurrence is read in the **event's own frame** via `eventTimeZone`
 *   (the viewer's zone for online events, UTC when `firstDate_tz` is null — the
 *   same fallback the display path uses, so a null-tz occurrence is read as UTC
 *   wall-clock here too).
 * - When a day, time, or date filter is active, an event with no `upcomingDates`
 *   is excluded (its occurrences can't be verified).
 */
export function matchesFilters(event: FilterableEvent, filters: EventFilters): boolean {
  if (filters.format !== 'any' && event.eventType !== filters.format) return false

  if (
    filters.languages.length > 0 &&
    !event.languages.some((code) => filters.languages.includes(code))
  ) {
    return false
  }

  if (filters.cadence !== 'any') {
    // `once` = a schedule with no recurrence; a schedule-less event is unknown
    // cadence, not one-time, so it doesn't match a specific cadence.
    const recurrence = event.schedule?.recurrenceType ?? null
    const matches =
      filters.cadence === 'once'
        ? event.schedule != null && recurrence === null
        : recurrence === filters.cadence

    if (!matches) return false
  }

  const dayActive = filters.daysOfWeek.length > 0
  const timeActive = isTimeRestricted(filters.timeOfDay)
  const dateActive = isDateRestricted(filters.dateRange)

  if (dayActive || timeActive || dateActive) {
    const occurrences = event.schedule?.upcomingDates

    // Can't verify a day/time/date match without occurrence data.
    if (!occurrences || occurrences.length === 0) return false

    const zone = eventTimeZone(event)
    const [earliest, latest] = filters.timeOfDay
    const { start, end } = filters.dateRange

    const matches = occurrences.some((occurrence) => {
      const local = DateTime.fromJSDate(occurrence, { zone })

      if (dayActive && !filters.daysOfWeek.includes(local.weekday)) return false
      if (timeActive) {
        const startHour = local.hour + local.minute / 60

        if (startHour < earliest || startHour > latest) return false
      }
      if (dateActive) {
        // Compare calendar dates in the event's own frame. `yyyy-MM-dd` strings are
        // fixed-width, so lexicographic order is chronological.
        const date = local.toISODate() ?? ''

        if (start && date < start) return false
        if (end && date > end) return false
      }

      return true
    })

    if (!matches) return false
  }

  return true
}

/** Whether any filter narrows the default (all-events) set — drives the trigger's active indicator. */
export const hasActiveFilters = (filters: EventFilters): boolean => activeFilterCount(filters) > 0

/** How many filter groups are non-default — shown as the trigger's badge count. */
export const activeFilterCount = (filters: EventFilters): number => {
  let count = 0

  if (filters.format !== 'any') count++
  if (filters.cadence !== 'any') count++
  if (filters.daysOfWeek.length > 0) count++
  if (filters.languages.length > 0) count++
  if (isTimeRestricted(filters.timeOfDay)) count++
  if (isDateRestricted(filters.dateRange)) count++

  return count
}

/**
 * A stable string identity for a filter set, for use in a React Query key. Arrays
 * are sorted so element order never varies the key (the list would otherwise
 * refetch on a no-op reorder).
 */
export const filtersKey = (filters: EventFilters): string =>
  JSON.stringify({
    format: filters.format,
    cadence: filters.cadence,
    timeOfDay: filters.timeOfDay,
    daysOfWeek: [...filters.daysOfWeek].sort((a, b) => a - b),
    languages: [...filters.languages].sort(),
    dateRange: [filters.dateRange.start, filters.dateRange.end],
  })

// ── URL serialization (the query params ARE the applied filters) ────────────────
// The filters live in the URL so a filtered view is linkable/shareable. One compact
// key per group; a default (unrestricted) group is omitted so links stay clean.

const FILTER_PARAM_KEYS = ['format', 'cadence', 'days', 'time', 'langs', 'dates'] as const
const CADENCES: readonly string[] = ['once', 'DAILY', 'WEEKLY', 'MONTHLY']

const parseDays = (value: string | null): number[] =>
  value
    ? [...new Set(value.split(',').map(Number))]
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
        .sort((a, b) => a - b)
    : []

const parseTime = (value: string | null): [number, number] => {
  const [earliest, latest] = (value ?? '').split(',').map(Number)
  const valid =
    Number.isFinite(earliest) &&
    Number.isFinite(latest) &&
    earliest >= TIME_MIN &&
    latest <= TIME_MAX &&
    earliest <= latest

  return valid ? [earliest, latest] : [TIME_MIN, TIME_MAX]
}

/**
 * Decode the `dates` param (`start,end`, either side blank for an open bound) into a
 * `DateRange`. Defensive like `parseTime`/`parseDays`: each side must be a strict
 * `yyyy-MM-dd`, is clamped into `[today, today + DATE_WINDOW_MONTHS]`, and a reversed
 * range collapses to no restriction — so a hand-crafted URL can't escape the window.
 */
const parseDates = (value: string | null): DateRange => {
  if (!value) return { start: null, end: null }

  const { min, max } = dateWindow()

  const clamp = (raw: string | undefined): string | null => {
    if (!raw) return null

    // Reject anything but a canonical calendar date (`toISODate` round-trips it).
    const date = DateTime.fromISO(raw, { zone: 'utc' })

    if (!date.isValid || date.toISODate() !== raw) return null
    if (raw < min) return min
    if (raw > max) return max

    return raw
  }

  const [rawStart, rawEnd] = value.split(',')
  const start = clamp(rawStart)
  const end = clamp(rawEnd)

  // A reversed range is contradictory — treat it as no restriction (like `parseTime`).
  if (start && end && start > end) return { start: null, end: null }

  return { start, end }
}

/** The applied filters decoded from a URL query — each group falls back to its default. */
export const filtersFromParams = (params: URLSearchParams): EventFilters => {
  const format = params.get('format')
  const cadence = params.get('cadence')
  const langs = params.get('langs')

  return {
    format: format === 'online' || format === 'offline' ? format : 'any',
    cadence: CADENCES.includes(cadence ?? '') ? (cadence as EventCadence) : 'any',
    daysOfWeek: parseDays(params.get('days')),
    timeOfDay: parseTime(params.get('time')),
    // Cap the list like the other groups are bounded — a hand-crafted URL can't
    // balloon it (values only feed `matchesFilters` includes + re-serialization).
    languages: langs ? [...new Set(langs.split(',').filter(Boolean))].sort().slice(0, 50) : [],
    dateRange: parseDates(params.get('dates')),
  }
}

/** Encode `filters` into a copy of `base`, preserving non-filter params (`q`/`center`/…). */
export const filtersToParams = (filters: EventFilters, base?: URLSearchParams): URLSearchParams => {
  const params = new URLSearchParams(base)

  FILTER_PARAM_KEYS.forEach((key) => params.delete(key))
  if (filters.format !== 'any') params.set('format', filters.format)
  if (filters.cadence !== 'any') params.set('cadence', filters.cadence)
  if (filters.daysOfWeek.length > 0) {
    params.set('days', [...filters.daysOfWeek].sort((a, b) => a - b).join(','))
  }
  if (isTimeRestricted(filters.timeOfDay)) params.set('time', filters.timeOfDay.join(','))
  if (filters.languages.length > 0) params.set('langs', [...filters.languages].sort().join(','))
  if (isDateRestricted(filters.dateRange)) {
    params.set('dates', `${filters.dateRange.start ?? ''},${filters.dateRange.end ?? ''}`)
  }

  return params
}
