import type { EventSchedule, EventType } from '@/types'

import { DateTime } from 'luxon'

import { DEFAULT_DURATION, eventTimeZone, scheduleTimeZone, withEndTime } from './event'
import {
  type EventFilters,
  DEFAULT_FILTERS,
  dateFloor,
  filtersFromParams,
  occurrenceMatchesFilters,
} from './filters'

import { wallClock } from '@/lib/time'

/**
 * Feed → calendar-entry expansion. SahajCloud pre-computes each event's recurrence
 * into `schedule.upcomingDates` (DAILY/WEEKLY/MONTHLY instants, exclusions applied),
 * so a calendar shows one entry PER occurrence, each read in the event's own display
 * frame — never naive JS-local time. Pure and timezone-correct like `matchesFilters`.
 */

/** The minimal event shape the expansion reads (a feed event + its joined title/route). */
export type CalendarSourceEvent = {
  id: number
  title: string
  /** Route to the event (drives the EventView navigation on click). */
  path: string
  eventType: EventType
  schedule?: EventSchedule | null
  /** The event's parent region name — where it is when it has no address. */
  regionName?: string | null
  /** The event's locality (address city) — where it is. */
  locality?: string | null
}

/**
 * A town typed all in capitals ("HARROGATE") reads as shouting beside the rest, so it is recased.
 * Any other name keeps the case it was given ("McLean"), and so does one of three letters or
 * fewer, which is likelier an abbreviation ("NYC") than a town.
 */
export const tidyPlaceCase = (name: string): string =>
  name !== name.toUpperCase() || name.length <= 3
    ? name
    : name
        .toLowerCase()
        // After an apostrophe only a name, not a possessive: "L'Aquila", "St John's".
        .replace(
          /(^|[\s-]|['’](?=\p{L}{2}))(\p{L})/gu,
          (_, before: string, letter: string) => before + letter.toUpperCase(),
        )

// The address city first: a region can be one venue ("R. do Catete, 311"), which says nothing next
// to the class name.
const placeOf = (event: CalendarSourceEvent): string | undefined => {
  const place = event.locality?.trim() || event.regionName?.trim()

  return place ? tidyPlaceCase(place) : undefined
}

/** One occurrence, as the wall clock of its display zone (`YYYY-MM-DD HH:mm`, no zone). */
export type CalendarEntry = {
  /** Unique per occurrence: `${eventId}-${startMillis}`. */
  id: string
  name: string
  /** The town it is in, left out where the name already is the place. */
  place?: string
  start: string
  end: string
  /** The event's route, carried through so a click opens the right EventView. */
  path: string
  online: boolean
}

// The occurrence already resolved into its display zone, so what the calendar shows is the local
// class time.
const WALL_CLOCK = 'yyyy-MM-dd HH:mm'

/** The day an entry starts on, `yyyy-MM-dd`. */
export const entryDay = (entry: Pick<CalendarEntry, 'start'>): string => entry.start.slice(0, 10)

/** An entry's start or end as its wall clock, for `formatTimeRange`, which reads only that. */
export const entryTime = (at: string): DateTime =>
  wallClock(Number(at.slice(11, 13)), Number(at.slice(14, 16)))

/**
 * Expands events into calendar entries: one per `upcomingDates` occurrence whose start
 * falls in `[from, to]` (absolute instants, defaulting to today through +12 months), and
 * matches the active day, time, and date filters (via `occurrenceMatchesFilters`, the
 * same cut `matchesFilters` applies). The event-level filters (format/language/cadence/
 * region) are already applied upstream, but a recurring event's individual occurrences
 * must still be trimmed. A "Mondays only" filter shows only the Monday occurrences of a
 * matching event. Each occurrence is read in the event's display zone (`eventTimeZone`:
 * the event's own zone for physical events, the viewer's for online, UTC when
 * `firstDate_tz` is null), and emitted as a wall-clock entry. The end is that day's
 * `endTime`, or +1h otherwise. An event with no occurrences contributes nothing.
 */
export const eventsToCalendarEntries = (
  events: CalendarSourceEvent[],
  filters: EventFilters,
  opts?: { from?: DateTime; to?: DateTime; today?: string },
): CalendarEntry[] => {
  const from = opts?.from ?? DateTime.now().startOf('day')
  const to = opts?.to ?? from.plus({ months: 12 })
  const floor = dateFloor(filters, opts?.today ?? from.toISODate() ?? undefined)
  const entries: CalendarEntry[] = []

  for (const event of events) {
    const occurrences = event.schedule?.upcomingDates

    if (!occurrences?.length) continue

    // Times display in the event's OWN zone for in-person classes and the VIEWER's zone for
    // online ones (`eventTimeZone`, shared with the list/detail views). `endTime` is an
    // event-LOCAL `HH:MM`, so the span is built in the event zone first, then both ends are
    // converted to the display zone — mirroring how `resolveEventDisplay` derives `nextEnd`.
    const displayZone = eventTimeZone(event)
    const eventZone = event.schedule ? scheduleTimeZone(event.schedule) : 'UTC'
    const endTime = event.schedule?.endTime
    const online = event.eventType === 'online'
    const place = placeOf(event)
    const title = event.title.trim()
    const name = title || place || ''

    for (const occurrence of occurrences) {
      // Read the occurrence in the event's own zone (so the event-local endTime applies to
      // the right day), then convert to the display zone. Luxon compares by absolute instant,
      // so the range/filter checks line up regardless of zone.
      const eventStart = DateTime.fromJSDate(occurrence, { zone: eventZone })
      const start = eventStart.setZone(displayZone)

      if (start < from || start > to) continue
      if (!occurrenceMatchesFilters(start, filters, floor)) continue

      // A same-minute (or unset) endTime leaves no visible span for the
      // week/day views, so this falls back to a default duration when the
      // end is not strictly after the start.
      const end = withEndTime(eventStart, endTime)?.setZone(displayZone)
      const finish = end && end > start ? end : start.plus(DEFAULT_DURATION)

      entries.push({
        id: `${event.id}-${start.toMillis()}`,
        name,
        // An online class's region says nothing about where to be.
        place: title && !online ? place : undefined,
        start: start.toFormat(WALL_CLOCK),
        end: finish.toFormat(WALL_CLOCK),
        path: event.path,
        online,
      })
    }
  }

  return entries
}

// ===== VIEWS ===== //

/** The calendar's two views. Month is the default, so only `?view=week` is ever written. */
export type CalendarViewName = 'month' | 'week'

const VIEW_PARAM = 'view'
const WEEK_PARAM = 'week'

export const calendarViewFromParams = (params: URLSearchParams): CalendarViewName =>
  params.get(VIEW_PARAM) === 'week' ? 'week' : 'month'

/**
 * The day the Week is paged to, from `?week=`. ⚠ `dates` is the fallback, so a link written
 * before the Week had a day of its own still opens on the stretch it names.
 */
export const weekFromParams = (params: URLSearchParams): string | null =>
  params.get(WEEK_PARAM) ?? filtersFromParams(params).dateRange.start

/** Writes the view and the Week's day onto `params`: the Month writes neither. */
export const calendarViewToParams = (
  view: CalendarViewName,
  week: string | null,
  params: URLSearchParams,
): URLSearchParams => {
  if (view === 'week') params.set(VIEW_PARAM, 'week')
  else params.delete(VIEW_PARAM)

  if (view === 'week' && week) params.set(WEEK_PARAM, week)
  else params.delete(WEEK_PARAM)

  return params
}

/**
 * The filters a visitor chose, for the pills, the Filters count and Clear's "anything to clear".
 * The place is the calendar's title, not a restriction they added.
 */
export const chosenCalendarFilters = (filters: EventFilters): EventFilters => ({
  ...filters,
  region: null,
})

/** What Clear leaves: the place, since the title is not a chosen filter. */
export const clearedCalendarFilters = (filters: EventFilters): EventFilters => ({
  ...DEFAULT_FILTERS,
  region: filters.region,
})

// ===== THE WEEK ===== //

const WEEK_DAYS = 7

const addDays = (iso: string, days: number): string =>
  DateTime.fromISO(iso).plus({ days }).toISODate() ?? iso

/** The seven days from `date`. */
const sevenFrom = (date: string) => ({ start: date, end: addDays(date, WEEK_DAYS - 1) })

/** The seven days the Week shows, as `yyyy-MM-dd`. */
export type CalendarWindow = { start: string; end: string; isThisWeek: boolean }

/** The Week the `week` day opens: the seven days from it, or from today where it names none. */
export const calendarWindow = (week: string | null, today: string): CalendarWindow => {
  const start = week && week > today ? week : today

  return { ...sevenFrom(start), isThisWeek: start === today }
}

/**
 * The `week` that opens the Week on `day`. Nothing before today has classes, so a day at or before
 * it opens this week, whose address is the plain one.
 */
export const weekFrom = (day: string, today: string): string | null => (day <= today ? null : day)

/** The `week` of the seven days next to a window. */
export const shiftWeek = (
  window: CalendarWindow,
  direction: -1 | 1,
  today: string,
): string | null => weekFrom(addDays(window.start, direction * WEEK_DAYS), today)

/** Every day from `start` to `end`, inclusive, as `yyyy-MM-dd`. */
export const daysBetween = (start: string, end: string): string[] => {
  const days: string[] = []

  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day)

  return days
}

// ===== THE MONTH ===== //

/**
 * The days a month grid shows: whole weeks from the one holding the 1st to the one holding the
 * last day, starting on `firstWeekday` (1 = Monday … 7 = Sunday, as Luxon numbers them).
 */
export const monthGrid = (month: string, firstWeekday: number): string[][] => {
  const first = DateTime.fromISO(month).startOf('month')
  const last = first.endOf('month').startOf('day')
  const lead = (first.weekday - firstWeekday + 7) % 7
  const start = first.minus({ days: lead })
  const weeks: string[][] = []

  for (let week = start; week <= last; week = week.plus({ weeks: 1 })) {
    weeks.push(
      Array.from({ length: 7 }, (_, offset) => week.plus({ days: offset }).toISODate() ?? ''),
    )
  }

  return weeks
}

/** Entries grouped by the day they start on, each day's in start order. */
export const entriesByDay = (entries: readonly CalendarEntry[]): Map<string, CalendarEntry[]> => {
  const days = new Map<string, CalendarEntry[]>()

  for (const entry of [...entries].sort((a, b) => a.start.localeCompare(b.start))) {
    const day = entryDay(entry)
    const list = days.get(day)

    if (list) list.push(entry)
    else days.set(day, [entry])
  }

  return days
}
