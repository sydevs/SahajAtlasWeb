import type { EventSchedule, EventType } from '@/types'

import { DateTime } from 'luxon'

import { eventTimeZone, withEndTime } from './event'
import {
  type EventFilters,
  type TimePeriod,
  dateFloor,
  occurrenceMatchesFilters,
  timePeriodRanges,
} from './filters'

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
  /** The event's parent region name — the default (concise) calendar label. */
  regionName?: string | null
  /** The event's locality (address city) — the label when the calendar is region-scoped. */
  locality?: string | null
}

// The event's place (parent region name, or — when the calendar is already scoped to a
// region so every entry shares it — the finer-grained address locality). No title fallback
// here: the caller decides what a placeless entry reads as.
const placeOf = (event: CalendarSourceEvent, regionScoped: boolean): string | undefined => {
  const region = event.regionName?.trim() || undefined
  const locality = event.locality?.trim() || undefined

  return regionScoped ? locality || region : region || locality
}

/**
 * The concise label a calendar entry shows instead of the (often long) event title: the
 * event's place (see `placeOf`). Online programs prepend the "Online" term to the place
 * (`onlineLabel` — the caller passes the translated word), or read as just "Online" when
 * they carry no place. A placeless offline entry falls back to the title so it's never blank.
 */
const calendarLabel = (
  event: CalendarSourceEvent,
  regionScoped: boolean,
  onlineLabel?: string,
): string => {
  const place = placeOf(event, regionScoped)

  if (event.eventType === 'online' && onlineLabel) {
    return place ? `${onlineLabel} · ${place}` : onlineLabel
  }

  return place || event.title
}

/** One occurrence, in Schedule-X's wall-clock shape (`YYYY-MM-DD HH:mm`, no zone). */
export type CalendarEntry = {
  /** Unique per occurrence: `${eventId}-${startMillis}`. */
  id: string
  title: string
  start: string
  end: string
  /** The event's route, carried through so a click opens the right EventView. */
  path: string
  /** Schedule-X calendar id — set to `online` for online programs so they get their own colour. */
  calendarId?: string
}

// Schedule-X reads a plain wall-clock string; we hand it the occurrence already
// resolved into its display zone, so what the grid shows is the local class time.
const SX_FORMAT = 'yyyy-MM-dd HH:mm'

// A placeless fallback length for an occurrence with no stored `endTime`, so every
// entry has a non-zero span for the week/day views to lay out.
const DEFAULT_DURATION = { hours: 1 }

/**
 * Expand events into calendar entries — one per `upcomingDates` occurrence whose start
 * falls in `[from, to]` (absolute instants; defaults to today … +12 months) AND matches
 * the active day / time / date filters (via `occurrenceMatchesFilters`, the same cut
 * `matchesFilters` applies). The event-level filters (format/language/cadence/region) are
 * already applied upstream, but a recurring event's individual occurrences must still be
 * trimmed — a "Mondays only" filter shows only the Monday occurrences of a matching event.
 * Each occurrence is read in the event's display zone (`eventTimeZone`: the event's own
 * zone for physical events, the viewer's for online, UTC when `firstDate_tz` is null) and
 * emitted as a wall-clock entry; the end is that day's `endTime`, else +1h. An event with
 * no occurrences contributes nothing.
 */
export const eventsToCalendarEntries = (
  events: CalendarSourceEvent[],
  filters: EventFilters,
  opts?: { from?: DateTime; to?: DateTime; today?: string; onlineLabel?: string },
): CalendarEntry[] => {
  const from = opts?.from ?? DateTime.now().startOf('day')
  const to = opts?.to ?? from.plus({ months: 12 })
  const floor = dateFloor(filters, opts?.today ?? from.toISODate() ?? undefined)
  // When a region is selected every entry sits under it, so the region name would be the
  // same for all — show the finer-grained locality instead (computed per event below).
  const regionScoped = filters.region != null
  const entries: CalendarEntry[] = []

  for (const event of events) {
    const occurrences = event.schedule?.upcomingDates

    if (!occurrences?.length) continue

    const zone = eventTimeZone(event)
    const endTime = event.schedule?.endTime
    const label = calendarLabel(event, regionScoped, opts?.onlineLabel)
    const calendarId = event.eventType === 'online' ? 'online' : undefined

    for (const occurrence of occurrences) {
      // Luxon compares by absolute instant, so the event-zone start and the viewer-zone
      // bounds line up correctly regardless of their zones.
      const start = DateTime.fromJSDate(occurrence, { zone })

      if (start < from || start > to) continue
      if (!occurrenceMatchesFilters(start, filters, floor)) continue

      // A same-minute (or unset) endTime leaves no visible span for the week/day views,
      // so fall back to a default duration when the end isn't strictly after the start.
      const end = withEndTime(start, endTime)
      const finish = end && end > start ? end : start.plus(DEFAULT_DURATION)

      entries.push({
        id: `${event.id}-${start.toMillis()}`,
        title: label,
        start: start.toFormat(SX_FORMAT),
        end: finish.toFormat(SX_FORMAT),
        path: event.path,
        calendarId,
      })
    }
  }

  return entries
}

const clampHour = (hour: number): number => Math.max(0, Math.min(24, hour))

// An `HH:00` bound Schedule-X's `dayBoundaries` reads (it accepts an overnight span
// where start > end).
const hhmm = (hour: number): string => `${String(clampHour(hour)).padStart(2, '0')}:00`

// The wall-clock hour (fractional) of an entry's `YYYY-MM-DD HH:mm` bound.
const entryHour = (wallClock: string): number => {
  const [hour, minute] = (wallClock.split(' ')[1] ?? '').split(':').map(Number)

  return (hour || 0) + (minute || 0) / 60
}

/**
 * The week/day time-grid bounds to frame the visible hours (Schedule-X `dayBoundaries`),
 * or `undefined` to leave its default:
 *
 * - **Time-of-day filter set** → span the selected period(s). A single range (including a
 *   night span that wraps midnight, e.g. `21:00`–`06:00`) frames the grid directly;
 *   several non-wrapping ranges span from the earliest start to the latest end.
 * - **Otherwise** → hug the entries: 1 h before the earliest occurrence start and 1 h
 *   after the latest end (an overnight entry counts to the day's end). Undefined when there
 *   are no entries.
 */
export const computeDayBoundaries = (
  entries: CalendarEntry[],
  timeOfDay: readonly TimePeriod[],
): { start: string; end: string } | undefined => {
  if (timeOfDay.length > 0) {
    const ranges = timePeriodRanges(timeOfDay)

    if (ranges.length === 1) return { start: hhmm(ranges[0][0]), end: hhmm(ranges[0][1]) }
    if (ranges.length > 1 && !ranges.some(([s, e]) => s > e)) {
      return {
        start: hhmm(Math.min(...ranges.map(([s]) => s))),
        end: hhmm(Math.max(...ranges.map(([, e]) => e))),
      }
    }

    return undefined // whole-day cover, or an ambiguous wrap → Schedule-X default
  }

  let earliest = 24
  let latest = 0

  for (const entry of entries) {
    const start = entryHour(entry.start)
    let end = entryHour(entry.end)

    if (end <= start) end = 24 // an overnight entry ends the next day — count to day's end

    earliest = Math.min(earliest, start)
    latest = Math.max(latest, end)
  }

  if (earliest >= latest) return undefined // no entries

  return { start: hhmm(Math.floor(earliest) - 1), end: hhmm(Math.ceil(latest) + 1) }
}
