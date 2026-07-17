import type { EventSchedule, Weekday } from '@/types'

import { DateTime } from 'luxon'

/**
 * Hand-rolled iCalendar (RFC 5545) export — no runtime dependency; the bundle is
 * public (issue #52). The export carries the REAL recurrence: `DTSTART;TZID` in
 * the event's own zone, an `RRULE` built from the structured schedule fields and
 * `EXDATE`s expanded from the exclusion windows — the importing calendar app then
 * owns all viewer-timezone/DST conversion (the one place that problem solves
 * itself).
 *
 * We reference IANA TZIDs without a VTIMEZONE component: Google/Apple/Outlook
 * all resolve IANA ids natively, while a hand-generated VTIMEZONE (with its own
 * DST RRULEs) is exactly the kind of thing that goes subtly wrong.
 */

export type IcsEventInput = {
  id: number | string
  title: string
  schedule: EventSchedule
  description?: string | null
  location?: string | null
  url?: string | null
}

const WEEKDAY_TO_LUXON: Record<Weekday, number> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 7,
}

const eventZone = (schedule: EventSchedule): string => schedule.firstDate_tz ?? 'UTC'

const seriesStart = (schedule: EventSchedule): DateTime =>
  DateTime.fromJSDate(schedule.firstDate).setZone(eventZone(schedule))

/** RFC 5545 "floating local" stamp — combined with TZID on the property. */
const localStamp = (dt: DateTime): string => dt.toFormat("yyyyMMdd'T'HHmmss")

const utcStamp = (dt: DateTime): string => dt.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'")

/** Same-day end of an occurrence, when the schedule has an `endTime`. */
const occurrenceEnd = (start: DateTime, schedule: EventSchedule): DateTime | null => {
  const [hour, minute] = (schedule.endTime ?? '').split(':').map(Number)

  return Number.isFinite(hour) && Number.isFinite(minute) ? start.set({ hour, minute }) : null
}

/**
 * The RRULE for a schedule, or null for a one-off. Reads only the fields the
 * discriminators (`recurrenceType`/`monthlyMode`/`endingType`) make meaningful —
 * the CMS form leaves stale values in the rest.
 */
export const buildRrule = (schedule: EventSchedule): string | null => {
  const type = schedule.recurrenceType

  if (!type) return null

  const parts = [`FREQ=${type}`]
  const interval = schedule.interval ?? 1

  if (interval > 1) parts.push(`INTERVAL=${interval}`)

  if (type === 'WEEKLY' && schedule.weekdays?.length) {
    parts.push(`BYDAY=${schedule.weekdays.join(',')}`)
  } else if (type === 'MONTHLY') {
    if (schedule.monthlyMode === 'weekday' && schedule.weekNumber && schedule.weekdayOfMonth) {
      parts.push(
        `BYDAY=${schedule.weekNumber === '-1' ? '-1' : schedule.weekNumber}${schedule.weekdayOfMonth}`,
      )
    } else {
      parts.push(`BYMONTHDAY=${schedule.monthDay ?? seriesStart(schedule).day}`)
    }
  }

  if (schedule.endingType === 'count' && schedule.count) {
    parts.push(`COUNT=${schedule.count}`)
  } else if (schedule.endingType === 'until' && schedule.untilDate) {
    // UNTIL must be UTC when DTSTART carries a TZID: the end of the until-day in
    // the event's own zone.
    const until = DateTime.fromJSDate(schedule.untilDate).setZone(eventZone(schedule)).endOf('day')

    parts.push(`UNTIL=${utcStamp(until)}`)
  }

  return parts.join(';')
}

/**
 * Whether the pattern lands on `day` (event-zone) — a per-day predicate, not a
 * recurrence engine; used only to expand the short exclusion windows to EXDATEs.
 */
const occursOn = (day: DateTime, schedule: EventSchedule): boolean => {
  const type = schedule.recurrenceType

  if (!type) return false

  const first = seriesStart(schedule)

  if (day.startOf('day') < first.startOf('day')) return false

  const interval = schedule.interval ?? 1

  if (type === 'DAILY') {
    return Math.round(day.startOf('day').diff(first.startOf('day'), 'days').days) % interval === 0
  }

  if (type === 'WEEKLY') {
    const weekdays = schedule.weekdays?.length
      ? schedule.weekdays.map((wd) => WEEKDAY_TO_LUXON[wd])
      : [first.weekday]

    if (!weekdays.includes(day.weekday)) return false

    const weeks = Math.round(day.startOf('week').diff(first.startOf('week'), 'weeks').weeks)

    return weeks % interval === 0
  }

  // MONTHLY
  const months = (day.year - first.year) * 12 + (day.month - first.month)

  if (months % interval !== 0) return false

  if (schedule.monthlyMode === 'weekday' && schedule.weekNumber && schedule.weekdayOfMonth) {
    if (day.weekday !== WEEKDAY_TO_LUXON[schedule.weekdayOfMonth]) return false
    if (schedule.weekNumber === '-1') return day.plus({ weeks: 1 }).month !== day.month

    return Math.ceil(day.day / 7) === Number(schedule.weekNumber)
  }

  return day.day === (schedule.monthDay ?? first.day)
}

// Cap the per-window EXDATE expansion — an exclusion is a holiday/seasonal
// break, not a decade; beyond this we truncate rather than loop.
const MAX_EXCLUSION_DAYS = 400

/** Occurrence instants (event-zone) skipped by the exclusion windows. */
export const exclusionDates = (schedule: EventSchedule): DateTime[] => {
  const zone = eventZone(schedule)
  const start = seriesStart(schedule)
  const dates: DateTime[] = []

  for (const exclusion of schedule.exclusions ?? []) {
    const from = DateTime.fromJSDate(exclusion.startDate).setZone(zone).startOf('day')
    const to = DateTime.fromJSDate(exclusion.endDate ?? exclusion.startDate)
      .setZone(zone)
      .startOf('day')

    for (
      let day = from, steps = 0;
      day <= to && steps < MAX_EXCLUSION_DAYS;
      day = day.plus({ days: 1 }), steps++
    ) {
      if (occursOn(day, schedule)) {
        // Anchor at the series' local start time — constant across DST shifts.
        dates.push(day.set({ hour: start.hour, minute: start.minute }))
      }
    }
  }

  return dates
}

/** Escape a TEXT property value per RFC 5545. */
const escapeText = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Fold long content lines (RFC 5545 §3.1): continuation lines start with a space. */
const fold = (line: string): string => {
  if (line.length <= 74) return line

  const chunks: string[] = []

  for (let i = 0; i < line.length; i += 74) chunks.push(line.slice(i, i + 74))

  return chunks.join('\r\n ')
}

export type BuildIcsOptions = {
  /** DTSTAMP override for deterministic output (tests). */
  now?: Date
}

/** The full VCALENDAR text for an event, ready to serve as an `.ics` download. */
export function buildEventIcs(input: IcsEventInput, options: BuildIcsOptions = {}): string {
  const { schedule } = input
  const zone = eventZone(schedule)
  const start = seriesStart(schedule)
  const end = occurrenceEnd(start, schedule)
  const rrule = buildRrule(schedule)

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sahaj Atlas//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:event-${input.id}@atlas.sydevelopers.com`,
    `DTSTAMP:${utcStamp(DateTime.fromJSDate(options.now ?? new Date()))}`,
    `SUMMARY:${escapeText(input.title)}`,
    `DTSTART;TZID=${zone}:${localStamp(start)}`,
    ...(end ? [`DTEND;TZID=${zone}:${localStamp(end)}`] : []),
    ...(rrule ? [`RRULE:${rrule}`] : []),
    ...exclusionDates(schedule).map((dt) => `EXDATE;TZID=${zone}:${localStamp(dt)}`),
    ...(input.location ? [`LOCATION:${escapeText(input.location)}`] : []),
    ...(input.description ? [`DESCRIPTION:${escapeText(input.description)}`] : []),
    ...(input.url ? [`URL:${input.url}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return lines.map(fold).join('\r\n') + '\r\n'
}

/** The Google Calendar "add event" template link — the RRULE rides `recur`. */
export function buildGoogleCalendarUrl(input: IcsEventInput): string {
  const { schedule } = input
  const start = seriesStart(schedule)
  const end = occurrenceEnd(start, schedule) ?? start
  const rrule = buildRrule(schedule)

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.title,
    dates: `${localStamp(start)}/${localStamp(end)}`,
    ctz: eventZone(schedule),
  })

  if (input.description || input.url) {
    params.set('details', [input.description, input.url].filter(Boolean).join('\n\n'))
  }
  if (input.location) params.set('location', input.location)
  if (rrule) params.set('recur', `RRULE:${rrule}`)

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
