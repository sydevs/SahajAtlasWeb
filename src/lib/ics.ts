import type { EventSchedule, Weekday } from '@/types'

import { DateTime } from 'luxon'

import { scheduleStart, scheduleTimeZone, withEndTime } from './shape/event'

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

// Schedule time primitives are shared with the display resolver (shape/event.ts)
// so the endTime wire format and zone fallback live in exactly one place.
const eventZone = scheduleTimeZone
const seriesStart = scheduleStart

/** RFC 5545 "floating local" stamp — combined with TZID on the property. */
const localStamp = (dt: DateTime): string => dt.toFormat("yyyyMMdd'T'HHmmss")

const utcStamp = (dt: DateTime): string => dt.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'")

/** Same-day end of an occurrence, when the schedule has an `endTime`. */
const occurrenceEnd = (start: DateTime, schedule: EventSchedule): DateTime | null =>
  withEndTime(start, schedule.endTime)

/**
 * The calendar DAY a date-only wire value means, in the event's zone. The CMS
 * stores date pickers as instants at midnight in *some* zone (UTC or the
 * admin's) — read naively in a zone west of that, the instant lands on the
 * previous local day. Normalizing via noon absorbs any offset up to ±12h.
 */
const dateOnlyIn = (value: Date, zone: string): DateTime =>
  DateTime.fromJSDate(value).setZone(zone).plus({ hours: 12 }).startOf('day')

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
      parts.push(`BYDAY=${schedule.weekNumber}${schedule.weekdayOfMonth}`)
    } else {
      parts.push(`BYMONTHDAY=${schedule.monthDay ?? seriesStart(schedule).day}`)
    }
  }

  if (schedule.endingType === 'count' && schedule.count) {
    parts.push(`COUNT=${schedule.count}`)
  } else if (schedule.endingType === 'until' && schedule.untilDate) {
    // UNTIL must be UTC when DTSTART carries a TZID: the end of the until-DAY in
    // the event's own zone (date-only value — normalized so a west-of-UTC zone
    // doesn't lose the final occurrence).
    const until = dateOnlyIn(schedule.untilDate, eventZone(schedule)).endOf('day')

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
    // Date-only values — normalized so the window lands on the intended days in
    // zones west of where the CMS stamped the midnight instant.
    const from = dateOnlyIn(exclusion.startDate, zone)
    const to = dateOnlyIn(exclusion.endDate ?? exclusion.startDate, zone)

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

/** Escape a TEXT property value per RFC 5545 (any newline form becomes \n). */
const escapeText = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')

const utf8 = new TextEncoder()

/**
 * Fold long content lines (RFC 5545 §3.1): max 75 OCTETS of UTF-8 per line,
 * continuation lines start with a space (which costs one of their 75). Iterates
 * code points so a multi-byte character is never split across the fold.
 */
const fold = (line: string): string => {
  if (utf8.encode(line).length <= 75) return line

  const chunks: string[] = []
  let current = ''
  let octets = 0

  for (const char of line) {
    const size = utf8.encode(char).length
    const limit = chunks.length === 0 ? 75 : 74

    if (octets + size > limit) {
      chunks.push(current)
      current = char
      octets = size
    } else {
      current += char
      octets += size
    }
  }

  chunks.push(current)

  return chunks.join('\r\n ')
}

export type BuildIcsOptions = {
  /** DTSTAMP override for deterministic output (tests). */
  now?: Date
}

/**
 * The exported series anchor. Recurring series anchor at their first session
 * (RRULE COUNT counts from DTSTART; past occurrences in a calendar are normal).
 * A one-off anchors at its next upcoming occurrence when one exists — a
 * rescheduled one-off may carry a stale `firstDate` while `upcomingDates`
 * holds the real date (the same drift the display resolver trusts).
 */
const exportStart = (schedule: EventSchedule): DateTime => {
  const upcoming = !schedule.recurrenceType && schedule.upcomingDates?.[0]

  return upcoming
    ? DateTime.fromJSDate(upcoming).setZone(eventZone(schedule))
    : seriesStart(schedule)
}

/** The full VCALENDAR text for an event, ready to serve as an `.ics` download. */
export function buildEventIcs(input: IcsEventInput, options: BuildIcsOptions = {}): string {
  const { schedule } = input
  const zone = eventZone(schedule)
  const start = exportStart(schedule)
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
    // URI value, not TEXT — no escaping, but strip control chars so an embedded
    // CRLF (which z.string().url() tolerates) can't inject calendar lines.
    ...(input.url ? [`URL:${input.url.replace(/[\r\n]/g, '')}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return lines.map(fold).join('\r\n') + '\r\n'
}

/** The Google Calendar "add event" template link — the RRULE rides `recur`. */
export function buildGoogleCalendarUrl(input: IcsEventInput): string {
  const { schedule } = input
  const start = exportStart(schedule)
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
