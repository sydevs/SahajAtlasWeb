import type { EventSchedule, EventType } from '@/types'

import { DateTime } from 'luxon'

import { eventTimeZone, withEndTime } from './event'
import { type EventFilters, dateFloor, occurrenceMatchesFilters } from './filters'

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
  range?: { from?: DateTime; to?: DateTime; today?: string },
): CalendarEntry[] => {
  const from = range?.from ?? DateTime.now().startOf('day')
  const to = range?.to ?? from.plus({ months: 12 })
  const floor = dateFloor(filters, range?.today ?? from.toISODate() ?? undefined)
  const entries: CalendarEntry[] = []

  for (const event of events) {
    const occurrences = event.schedule?.upcomingDates

    if (!occurrences?.length) continue

    const zone = eventTimeZone(event)
    const endTime = event.schedule?.endTime

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
        title: event.title,
        start: start.toFormat(SX_FORMAT),
        end: finish.toFormat(SX_FORMAT),
        path: event.path,
      })
    }
  }

  return entries
}
