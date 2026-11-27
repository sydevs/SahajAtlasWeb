import type { EventSchedule, EventType } from '@/types'

import { DateTime } from 'luxon'

import { DEFAULT_DURATION, eventTimeZone, scheduleTimeZone, withEndTime } from './event'
import { type DateRange, type EventFilters, dateFloor, occurrenceMatchesFilters } from './filters'

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

/** The URL word for the Week, `?view=week`. */
export const CALENDAR_WEEK_PARAM = 'week'

export const calendarViewFromParams = (params: URLSearchParams): CalendarViewName =>
  params.get('view') === CALENDAR_WEEK_PARAM ? 'week' : 'month'

// ===== THE WEEK ===== //

/** How many days the Week shows: today and the six after it, so a page is never a thin Sunday. */
export const CALENDAR_WEEK_DAYS = 7

const addDays = (iso: string, days: number): string =>
  DateTime.fromISO(iso).plus({ days }).toISODate() ?? iso

/** The seven days the Week shows, as `yyyy-MM-dd`. */
export type CalendarWindow = { start: string; end: string; isThisWeek: boolean }

/**
 * The Week a date range opens: the seven days from its first day, or from today with none. A link
 * naming another stretch, or a busy Month day, opens the seven days it starts on.
 */
export const calendarWindow = (range: DateRange, today: string): CalendarWindow => {
  const start = range.start && range.start > today ? range.start : today

  return { start, end: addDays(start, CALENDAR_WEEK_DAYS - 1), isThisWeek: start === today }
}

/** The week starting on `date`. */
export const weekFrom = (date: string): DateRange => ({
  start: date,
  end: addDays(date, CALENDAR_WEEK_DAYS - 1),
})

/**
 * The seven days next to a window. Nothing before today has classes, so a step back stops there,
 * and landing on this week clears the range, so its address is the plain one.
 */
export const shiftWeek = (window: CalendarWindow, direction: -1 | 1, today: string): DateRange => {
  const moved = addDays(window.start, direction * CALENDAR_WEEK_DAYS)

  return moved <= today ? { start: null, end: null } : weekFrom(moved)
}

/** The filters as the Week reads them: its own seven days in place of the link's range. */
export const weekFilters = (filters: EventFilters, today: string): EventFilters => {
  const { start, end } = calendarWindow(filters.dateRange, today)

  return { ...filters, dateRange: { start, end } }
}

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
    const day = entry.start.slice(0, 10)
    const list = days.get(day)

    if (list) list.push(entry)
    else days.set(day, [entry])
  }

  return days
}
