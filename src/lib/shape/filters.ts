import type { EventSchedule, EventType, FeedEvent } from '@/types'

import { DateTime } from 'luxon'

import { eventTimeZone } from './event'
import { type RegionTreeNode, indexRegions, subtreeIds } from './hierarchy'

/**
 * The event-filter model, shared by the SearchFilters panel, the URL filter codec
 * (`filtersToParams`/`filtersFromParams`), the events list, and the map.
 * `matchesFilters` is the single predicate both the list and the map apply, so a
 * filtered list and the filtered pins/clusters always agree.
 *
 * All fields have a "no restriction" default (`DEFAULT_FILTERS`). With every field
 * at its default, `matchesFilters` passes every event.
 */

/** The event format filter — `any`, or one of the `eventType` values. */
export type EventFormat = 'any' | EventType

/**
 * The event cadence filter, derived from `schedule.recurrenceType`. `once`
 * matches events with no recurrence (a null `recurrenceType`). `WEEKLY`/`MONTHLY`
 * match that recurrence directly.
 */
export type EventCadence = 'any' | 'once' | 'DAILY' | 'WEEKLY' | 'MONTHLY'

/** The four named times of day the filter selects, in day order. */
export type TimePeriod = 'morning' | 'afternoon' | 'evening' | 'night'
export const TIME_PERIODS = ['morning', 'afternoon', 'evening', 'night'] as const

// Each period's local-hour half-open interval(s), `[start, end)`. Night wraps
// midnight, so it is two intervals. `matchesFilters` tests an occurrence's start
// hour against these. `timePeriodRanges` coalesces them for display.
export const TIME_PERIOD_HOURS: Record<TimePeriod, readonly (readonly [number, number])[]> = {
  morning: [[6, 12]],
  afternoon: [[12, 17]],
  evening: [[17, 21]],
  night: [
    [21, 24],
    [0, 6],
  ],
}

// Selected periods in canonical day order (morning to night), de-duped. This
// keeps the URL param and the query key stable, regardless of selection order.
const sortPeriods = (periods: readonly TimePeriod[]): TimePeriod[] =>
  TIME_PERIODS.filter((period) => periods.includes(period))

/** How far ahead the date-range filter reaches from today — bounds the picker and the URL clamp. */
export const DATE_WINDOW_MONTHS = 12

/**
 * A calendar-date window: each bound an independent `yyyy-MM-dd` string, or
 * `null` for an open side. `{ start: null, end: null }` means no restriction.
 */
export type DateRange = { start: string | null; end: string | null }

export type EventFilters = {
  format: EventFormat
  /** Selected times of day. An event matches if a start falls in any. Empty means no restriction. */
  timeOfDay: TimePeriod[]
  /** Luxon weekday numbers, 1 (Mon) to 7 (Sun). Empty means no restriction. */
  daysOfWeek: number[]
  /** Language codes. An event matches if it offers any selected language. Empty means no restriction. */
  languages: string[]
  cadence: EventCadence
  /** Keep only events with an upcoming occurrence in this calendar-date window. */
  dateRange: DateRange
  /**
   * The region slug to scope to, or `null` for no restriction. An event matches
   * when its region is this region *or a descendant* of it (see
   * `buildRegionMatcher`), so selecting a country keeps every event in its
   * regions, areas, and venues.
   */
  region: string | null
}

export const DEFAULT_FILTERS: EventFilters = {
  format: 'any',
  timeOfDay: [],
  daysOfWeek: [],
  languages: [],
  cadence: 'any',
  dateRange: { start: null, end: null },
  region: null,
}

// This freezes the singleton and its arrays, so the store can safely seed or
// clear by aliasing these references. Nothing can mutate the shared default in place.
Object.freeze(DEFAULT_FILTERS.timeOfDay)
Object.freeze(DEFAULT_FILTERS.daysOfWeek)
Object.freeze(DEFAULT_FILTERS.languages)
Object.freeze(DEFAULT_FILTERS.dateRange)
Object.freeze(DEFAULT_FILTERS)

/** Whether any time-of-day period is selected (that is, the filter narrows the day). */
export const isTimeRestricted = (timeOfDay: readonly TimePeriod[]): boolean => timeOfDay.length > 0

/**
 * The selected periods as coalesced `[start, end)` hour ranges for display.
 * Adjacent or overlapping intervals are fused. A pair spanning midnight
 * (…-24 and 0-…) displays as one wrapping range — for example, night alone
 * becomes `[21, 6]`. This is empty when nothing is selected. The filter form's
 * readout and the active pill both use it.
 */
export const timePeriodRanges = (periods: readonly TimePeriod[]): [number, number][] => {
  const intervals = sortPeriods(periods)
    .flatMap((period) => TIME_PERIOD_HOURS[period])
    .map(([start, end]) => [start, end] as [number, number])
    .sort((a, b) => a[0] - b[0])

  const merged: [number, number][] = []

  for (const [start, end] of intervals) {
    const last = merged[merged.length - 1]

    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }

  // Fuses a midnight-spanning pair (…-24 and 0-…) into a single wrapping range.
  if (merged.length > 1 && merged[0][0] === 0 && merged[merged.length - 1][1] === 24) {
    const head = merged.shift()!

    merged[merged.length - 1] = [merged[merged.length - 1][0], head[1]]
  }

  // Every period selected covers the whole day. There is no meaningful window
  // to display, so callers default to their "any time" copy.
  if (merged.length === 1 && merged[0][0] === 0 && merged[0][1] === 24) return []

  return merged
}

/** Whether the date range narrows anything (that is, either bound is set). */
export const isDateRestricted = (dateRange: DateRange): boolean =>
  dateRange.start !== null || dateRange.end !== null

/** Today (the viewer's local zone) as `yyyy-MM-dd` — the floor for upcoming occurrences. */
export const todayISO = (): string => DateTime.now().startOf('day').toISODate() ?? ''

/**
 * The selectable date window — today through today plus `DATE_WINDOW_MONTHS`, as
 * `yyyy-MM-dd` in the viewer's local zone. It bounds the picker inputs and clamps
 * the URL codec, so a hand-crafted link cannot select outside the window.
 */
export const dateWindow = (): { min: string; max: string } => {
  const min = todayISO()

  return { min, max: DateTime.fromISO(min).plus({ months: DATE_WINDOW_MONTHS }).toISODate() ?? '' }
}

/** The subset of an event `matchesFilters` needs — so it works for `FeedEvent`, `EventSlim`, and `Event`. */
type FilterableEvent = Pick<FeedEvent, 'eventType' | 'languages'> & {
  schedule?: EventSchedule | null
  /** The direct region (present on feed features). It enables the region-filter cut. */
  region?: { id: number } | null
}

/**
 * Decides whether an event falls under the region filter's selection. Built by
 * `buildRegionMatcher` from the `['regions']` tree and passed into
 * `matchesFilters` by the callers that hold that tree (the map, the list
 * fetcher, the filter count).
 */
export type RegionMatcher = (event: FilterableEvent) => boolean

/**
 * A region-filter predicate over the region tree: an event matches when its
 * region is `regionSlug` or any descendant of it. This returns `undefined` —
 * meaning "no region restriction" — when no slug is selected, the tree is not
 * loaded yet, or the slug is not a known region (an unknown slug never narrows
 * the set). The descendant set is precomputed once, so the returned matcher is
 * O(1) per event on the map's hot path.
 */
export const buildRegionMatcher = (
  regions: RegionTreeNode[] | undefined,
  regionSlug: string | null,
): RegionMatcher | undefined => {
  if (!regionSlug || !regions?.length) return undefined

  const index = indexRegions(regions)
  const selected = index.bySlug.get(regionSlug)

  if (!selected) return undefined

  const subtree = subtreeIds(index, selected.id)

  return (event) => event.region != null && subtree.has(event.region.id)
}

/**
 * The date lower bound for the range filter, floored at today so an open-ended
 * "until Y" never matches a past occurrence (a set start is already at or
 * after today). This is an empty string when no date filter is active. Shared
 * so `matchesFilters` and the calendar floor identically.
 */
export const dateFloor = (filters: EventFilters, today?: string): string =>
  isDateRestricted(filters.dateRange) ? (filters.dateRange.start ?? today ?? todayISO()) : ''

/**
 * Whether one occurrence — already resolved to the event's display zone —
 * satisfies the active day, time, and date filters. This is the
 * PER-OCCURRENCE half of `matchesFilters`, exported so the calendar's
 * occurrence expansion applies the EXACT same cut: an event's list/map card
 * and its individual calendar entries then agree on which occurrences count.
 * `floor` is the pre-resolved date lower bound (from `dateFloor`).
 */
export const occurrenceMatchesFilters = (
  local: DateTime,
  filters: EventFilters,
  floor: string,
): boolean => {
  if (filters.daysOfWeek.length > 0 && !filters.daysOfWeek.includes(local.weekday)) return false

  if (isTimeRestricted(filters.timeOfDay)) {
    const startHour = local.hour + local.minute / 60
    const inPeriod = filters.timeOfDay.some((period) =>
      TIME_PERIOD_HOURS[period].some(([from, to]) => startHour >= from && startHour < to),
    )

    if (!inPeriod) return false
  }

  if (isDateRestricted(filters.dateRange)) {
    // Compares calendar dates in the event's own frame. `yyyy-MM-dd` strings
    // are fixed-width, so lexicographic order is chronological.
    const date = local.toISODate() ?? ''

    if (date < floor) return false
    if (filters.dateRange.end && date > filters.dateRange.end) return false
  }

  return true
}

/**
 * Does an event pass the given filters? This is pure and timezone-correct:
 *
 * - **Day, time, and date range are evaluated together, per occurrence.** An
 *   event matches only if some `schedule.upcomingDates` occurrence falls on a
 *   selected weekday *and* starts within the time range *and* lands in the
 *   date window. A Monday-morning occurrence and a Wednesday-evening
 *   occurrence do not combine to satisfy "Wednesday morning". A Jul-20
 *   occurrence and a Jul-27 occurrence do not combine to satisfy a single-day
 *   range either.
 * - The date range floors at `today` (the passed-in day, or the viewer's day
 *   otherwise). No upcoming occurrence predates today, so an open-ended
 *   "until Y" cannot surface a stale or timezone-shifted past occurrence. A
 *   set start is already clamped to at or after today by the codec.
 * - Each occurrence is read in the **event's own frame** via `eventTimeZone`:
 *   the viewer's zone for online events, and UTC when `firstDate_tz` is null.
 *   This is the same fallback the display path uses, so a null-tz occurrence
 *   is read as UTC wall-clock here too.
 * - When a day, time, or date filter is active, an event with no
 *   `upcomingDates` is excluded (its occurrences cannot be verified).
 * - The region cut (selected region plus descendants) is applied via the
 *   optional `matchesRegion` resolver. This keeps region the single predicate
 *   the list, map, and filter count share, instead of a separate pass that
 *   could drift.
 */
export function matchesFilters(
  event: FilterableEvent,
  filters: EventFilters,
  today?: string,
  matchesRegion?: RegionMatcher,
): boolean {
  if (filters.format !== 'any' && event.eventType !== filters.format) return false

  // The region cut narrows only when a region is selected AND a resolver is
  // supplied (the resolver carries the region tree). A selected region with
  // no resolver is treated as no restriction, so a caller lacking the tree
  // degrades gracefully instead of excluding every event.
  if (filters.region && matchesRegion && !matchesRegion(event)) return false

  if (
    filters.languages.length > 0 &&
    !event.languages.some((code) => filters.languages.includes(code))
  ) {
    return false
  }

  if (filters.cadence !== 'any') {
    // `once` means a schedule with no recurrence. A schedule-less event has
    // unknown cadence, not one-time cadence, so it does not match a specific
    // cadence.
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

    // Cannot verify a day/time/date match without occurrence data.
    if (!occurrences || occurrences.length === 0) return false

    const zone = eventTimeZone(event)
    const floor = dateFloor(filters, today)

    // An event matches when SOME occurrence satisfies day, time, and date
    // together — the Monday-morning and Wednesday-evening occurrences do not
    // combine. The calendar reuses `occurrenceMatchesFilters` per occurrence
    // to keep only the matching ones.
    const matches = occurrences.some((occurrence) =>
      occurrenceMatchesFilters(DateTime.fromJSDate(occurrence, { zone }), filters, floor),
    )

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
  if (filters.region) count++

  return count
}

/**
 * A stable string identity for a filter set, for use in a React Query key.
 * Arrays are sorted, so element order never varies the key (the list would
 * otherwise refetch on a no-op reorder).
 */
export const filtersKey = (filters: EventFilters): string =>
  JSON.stringify({
    format: filters.format,
    cadence: filters.cadence,
    timeOfDay: sortPeriods(filters.timeOfDay),
    daysOfWeek: [...filters.daysOfWeek].sort((a, b) => a - b),
    languages: [...filters.languages].sort(),
    dateRange: filters.dateRange,
    region: filters.region,
  })

// ── URL serialization (the query params ARE the applied filters) ────────────────
// The filters live in the URL, so a filtered view is linkable and shareable. One
// compact key per group. A default (unrestricted) group is omitted so links stay
// clean.

/**
 * Every query-parameter name the filters own.
 *
 * This is exported because `routing=path` has to know which of the host page's
 * parameters are the widget's, to read and rewrite (`WIDGET_PARAMS`,
 * `./routing`). A hand-copied list there silently dropped every filter on
 * navigation, before this was shared.
 */
export const FILTER_PARAM_KEYS = [
  'format',
  'cadence',
  'days',
  'time',
  'langs',
  'dates',
  'region',
] as const
const CADENCES: readonly string[] = ['once', 'DAILY', 'WEEKLY', 'MONTHLY']

const parseDays = (value: string | null): number[] =>
  value
    ? [...new Set(value.split(',').map(Number))]
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
        .sort((a, b) => a - b)
    : []

const parsePeriods = (value: string | null): TimePeriod[] =>
  value
    ? sortPeriods(
        value
          .split(',')
          .filter((token): token is TimePeriod =>
            (TIME_PERIODS as readonly string[]).includes(token),
          ),
      )
    : []

/**
 * Decodes the `dates` param (`start,end`, either side blank for an open bound)
 * into a `DateRange`. This is defensive like `parsePeriods`/`parseDays`. Each
 * side must be a strict `yyyy-MM-dd`. Each side is also clamped into
 * `[today, today + DATE_WINDOW_MONTHS]`, and a reversed range collapses to no
 * restriction. So a hand-crafted URL cannot escape the window.
 */
const parseDates = (value: string | null): DateRange => {
  if (!value) return { start: null, end: null }

  const { min, max } = dateWindow()

  const clamp = (raw: string | undefined): string | null => {
    if (!raw) return null

    // Rejects anything but a canonical calendar date (`toISODate` round-trips it).
    const date = DateTime.fromISO(raw, { zone: 'utc' })

    if (!date.isValid || date.toISODate() !== raw) return null
    if (raw < min) return min
    if (raw > max) return max

    return raw
  }

  const [rawStart, rawEnd] = value.split(',')
  const start = clamp(rawStart)
  const end = clamp(rawEnd)

  // A reversed range is contradictory — this treats it as no restriction (like `parsePeriods`).
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
    timeOfDay: parsePeriods(params.get('time')),
    // This caps the list, like the other groups are bounded. A hand-crafted
    // URL cannot balloon it (values only feed `matchesFilters` includes and
    // re-serialization).
    languages: langs ? [...new Set(langs.split(',').filter(Boolean))].sort().slice(0, 50) : [],
    dateRange: parseDates(params.get('dates')),
    // A raw slug, length-capped defensively. It is verified against the loaded
    // region set downstream — an unknown slug resolves to no restriction in
    // `buildRegionMatcher`.
    region: params.get('region')?.slice(0, 128) || null,
  }
}

/** Encodes `filters` into a copy of `base`, preserving non-filter params (`q`/`center`/…). */
export const filtersToParams = (filters: EventFilters, base?: URLSearchParams): URLSearchParams => {
  const params = new URLSearchParams(base)

  FILTER_PARAM_KEYS.forEach((key) => params.delete(key))
  if (filters.format !== 'any') params.set('format', filters.format)
  if (filters.cadence !== 'any') params.set('cadence', filters.cadence)
  if (filters.daysOfWeek.length > 0) {
    params.set('days', [...filters.daysOfWeek].sort((a, b) => a - b).join(','))
  }
  if (isTimeRestricted(filters.timeOfDay))
    params.set('time', sortPeriods(filters.timeOfDay).join(','))
  if (filters.languages.length > 0) params.set('langs', [...filters.languages].sort().join(','))
  if (isDateRestricted(filters.dateRange)) {
    params.set('dates', `${filters.dateRange.start ?? ''},${filters.dateRange.end ?? ''}`)
  }
  if (filters.region) params.set('region', filters.region)

  return params
}
