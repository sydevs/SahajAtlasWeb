import type { CalendarEntry } from '@/lib/shape'

import { DateTime } from 'luxon'
// ⚠ The module, never `temporal-polyfill/global` (see CalendarView.tsx).
import { Temporal } from 'temporal-polyfill'

const toScheduleXEvent = (entry: CalendarEntry, zone: string) => {
  const wallStart = Temporal.PlainDateTime.from(entry.start)
  const wallEnd = Temporal.PlainDateTime.from(entry.end)
  // shortcut: a wall clock inside the viewer's spring-forward gap shows an hour late, upgrade if a class is ever scheduled into one.
  const start = wallStart.toZonedDateTime(zone)
  // Such a start lands an hour later, so the end keeps the length: anchored on its own, it could
  // sit before the start.
  const end = start.toPlainDateTime().equals(wallStart)
    ? wallEnd.toZonedDateTime(zone)
    : start.add(wallStart.until(wallEnd))

  return { ...entry, start, end }
}

/**
 * Schedule-X's `timezone` and `events` for `entries`: the viewer's zone, so "today" is theirs (SX
 * defaults to UTC), with every entry anchored there at its own wall clock. SX draws every event
 * in that one zone, so this keeps an in-person class in its own clock (`eventTimeZone`).
 */
export const scheduleXTimeline = (
  entries: CalendarEntry[],
  zone = DateTime.local().zoneName ?? 'UTC',
) => ({
  timezone: zone,
  events: entries.map((entry) => toScheduleXEvent(entry, zone)),
})
