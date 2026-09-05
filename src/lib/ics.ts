import type { EventSchedule, Weekday } from '@/types'

import { DateTime } from 'luxon'

import { DEFAULT_DURATION, scheduleStart, scheduleTimeZone, withEndTime } from './shape/event'

/**
 * A hand-rolled iCalendar (RFC 5545) export, with no runtime dependency. The
 * bundle is public (issue #52). The export carries the real recurrence:
 * `DTSTART;TZID` in the event's own zone, an `RRULE` built from the structured
 * schedule fields, and `EXDATE`s expanded from the exclusion windows. The
 * importing calendar app then owns all viewer-timezone and DST conversion,
 * the one place that problem solves itself.
 *
 * This references IANA TZIDs without a VTIMEZONE component. Google, Apple,
 * and Outlook all resolve IANA ids natively, while a hand-generated VTIMEZONE
 * (with its own DST RRULEs) is exactly the kind of thing that goes subtly
 * wrong.
 *
 * ## Why this is hand-rolled, instead of a dependency (issue #105)
 *
 * This claim is measured, not assumed. `datebook` (3.3 KiB gz, zero deps) and
 * `calendar-link` (4.9 KiB gz, pulls in dayjs, a second date library beside
 * the luxon we already ship) both emit `DTSTART:20260907T180000Z`: a bare UTC
 * instant with **no `TZID`**. That is not a style difference. A weekly 19:00
 * London class anchored to a UTC instant silently becomes 18:00 for every
 * occurrence after the October DST change, because the absolute instant is
 * preserved and the wall-clock time is not. `ics` (23.6 KiB gz) is heavier
 * still, and no better on this point. Recurrence in the viewer's own timezone
 * is the whole job here, so a library that cannot express it is not a
 * smaller version of this file. It is a wrong one. (`calendar-link` also
 * emits `LOCATION:a, b` with the comma unescaped, an RFC 5545 violation.)
 *
 * ## Why not the CMS's own `icalRule`
 *
 * SahajCloud computes `schedule.icalRule` (rrule-temporal's `toString()`),
 * and it is selected onto the feed. But it is not usable as-is, for four
 * reasons, and SahajCloud's own ICS builder rejects it for the same ones:
 *
 *  - A non-recurring event still gets `FREQ=DAILY;COUNT=1` (one-offs are
 *    modelled that way internally), so a single class would import as a
 *    series.
 *  - Its `EXDATE` is UTC-stamped while its `DTSTART` is TZID-local, and a UTC
 *    EXDATE frequently fails to match a TZID-local instance. The cancelled
 *    session then still shows.
 *  - It carries no `DTEND` (`endTime` is absent from it entirely).
 *  - It never folds lines at 75 octets.
 *
 * So the RRULE is rebuilt here from the structured fields, which the full
 * event doc carries in full (`getEventDoc` selects `schedule: true`). Note
 * that the feed does not carry `monthDay` / `weekdayOfMonth` / `untilDate` /
 * `exclusions`. Build the export from the full doc, never from a feed event.
 */

export type IcsEventInput = {
  id: number | string
  title: string
  schedule: EventSchedule
  description?: string | null
  location?: string | null
  url?: string | null
  /**
   * The specific session to anchor a recurrence-less target on: the date the
   * viewer actually registered for. Only the providers whose URL API has no
   * recurrence parameter (Outlook, Office 365, Yahoo) read it. The ICS and
   * the Google link carry the real RRULE, and so must stay anchored on the
   * series.
   */
  from?: Date | null
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

// The schedule time primitives are shared with the display resolver
// (shape/event.ts), so the endTime wire format and zone fallback live in
// exactly one place.
const eventZone = scheduleTimeZone
const seriesStart = scheduleStart

/** The RFC 5545 "floating local" stamp — combined with TZID on the property. */
const localStamp = (dt: DateTime): string => dt.toFormat("yyyyMMdd'T'HHmmss")

const utcStamp = (dt: DateTime): string => dt.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'")

/**
 * The end of an occurrence: the schedule's `endTime`, or `DEFAULT_DURATION`
 * otherwise.
 *
 * A DTSTART with no DTEND is legal. RFC 5545 §3.6.1 makes it a zero-length
 * instant. But every calendar app draws that as a hairline, and the three
 * provider URLs below have no way to express it at all (their APIs require
 * an end). The fallback triggers on any end that is not strictly after the
 * start, not merely on a missing one, so an `endTime` equal to the start
 * time also gets a real span. `shape/calendar.ts` applies the same
 * condition to the grid, from the same constant, so the block a viewer sees
 * and the file they download cannot describe one class two different
 * lengths.
 */
const occurrenceEnd = (start: DateTime, schedule: EventSchedule): DateTime => {
  const end = withEndTime(start, schedule.endTime)

  return end && end > start ? end : start.plus(DEFAULT_DURATION)
}

/**
 * The calendar day a date-only wire value means, in the event's zone. The
 * CMS stores date pickers as instants at midnight in *some* zone (UTC or the
 * admin's). Read naively in a zone west of that, the instant lands on the
 * previous local day. Normalizing via noon absorbs any offset up to plus or
 * minus 12 hours.
 */
const dateOnlyIn = (value: Date, zone: string): DateTime =>
  DateTime.fromJSDate(value).setZone(zone).plus({ hours: 12 }).startOf('day')

/**
 * The RRULE for a schedule, or null for a one-off. This reads only the fields
 * the discriminators (`recurrenceType`/`monthlyMode`/`endingType`) make
 * meaningful — the CMS form leaves stale values in the rest.
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
    // UNTIL must be UTC when DTSTART carries a TZID: the end of the until-DAY
    // in the event's own zone (a date-only value — normalized so a
    // west-of-UTC zone does not lose the final occurrence).
    const until = dateOnlyIn(schedule.untilDate, eventZone(schedule)).endOf('day')

    parts.push(`UNTIL=${utcStamp(until)}`)
  }

  return parts.join(';')
}

/**
 * Whether the pattern lands on `day` (event-zone): a per-day predicate, not
 * a recurrence engine. It expands only the short exclusion windows to
 * EXDATEs.
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

// This caps the per-window EXDATE expansion. An exclusion is a holiday or
// seasonal break, not a decade. Beyond this the loop truncates, instead of
// continuing.
const MAX_EXCLUSION_DAYS = 400

/** The occurrence instants (event-zone) skipped by the exclusion windows. */
export const exclusionDates = (schedule: EventSchedule): DateTime[] => {
  const zone = eventZone(schedule)
  const start = seriesStart(schedule)
  const dates: DateTime[] = []

  for (const exclusion of schedule.exclusions ?? []) {
    // Date-only values — normalized so the window lands on the intended days
    // in zones west of where the CMS stamped the midnight instant.
    const from = dateOnlyIn(exclusion.startDate, zone)
    const to = dateOnlyIn(exclusion.endDate ?? exclusion.startDate, zone)

    for (
      let day = from, steps = 0;
      day <= to && steps < MAX_EXCLUSION_DAYS;
      day = day.plus({ days: 1 }), steps++
    ) {
      if (occursOn(day, schedule)) {
        // Anchors at the series' local start time — constant across DST
        // shifts.
        dates.push(day.set({ hour: start.hour, minute: start.minute }))
      }
    }
  }

  return dates
}

/** Escapes a TEXT property value per RFC 5545 (any newline form becomes \n). */
const escapeText = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')

const utf8 = new TextEncoder()

/**
 * Folds long content lines (RFC 5545 §3.1): max 75 OCTETS of UTF-8 per line,
 * and continuation lines start with a space (which costs one of their 75).
 * This iterates code points, so a multi-byte character is never split across
 * the fold.
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
 * The exported series anchor. A recurring series anchors at its first
 * session. RRULE COUNT counts from DTSTART, and past occurrences in a
 * calendar are normal. A one-off anchors at the session the viewer
 * registered for when we know it, or at its next upcoming occurrence
 * otherwise. A rescheduled one-off may carry a stale `firstDate`, while
 * `upcomingDates` holds the real date: the same drift the display resolver
 * trusts.
 *
 * `from` cannot move a recurring anchor. DTSTART is the instance the RRULE
 * counts from, so re-anchoring an 8-session course on session 5 would hand
 * the importer eight more sessions starting there.
 */
const exportStart = (schedule: EventSchedule, from?: Date | null): DateTime =>
  schedule.recurrenceType ? seriesStart(schedule) : occurrenceStart(schedule, from)

/**
 * The anchor for a target that cannot carry recurrence (Outlook, Office 365,
 * Yahoo: none of their URL APIs has a recurrence parameter). Those get a
 * single event, so it has to be the right single event: the session the
 * viewer registered for, or the next upcoming one otherwise.
 *
 * This is never the series start, which is what `exportStart` gives a
 * recurring event. A weekly class that has run since 2019 would otherwise
 * drop a 2019 date into the viewer's calendar and call it done.
 */
const occurrenceStart = (schedule: EventSchedule, from?: Date | null): DateTime => {
  const anchor = from ?? schedule.upcomingDates?.[0]

  return anchor ? DateTime.fromJSDate(anchor).setZone(eventZone(schedule)) : seriesStart(schedule)
}

/** The full VCALENDAR text for an event, ready to serve as an `.ics` download. */
export function buildEventIcs(input: IcsEventInput, options: BuildIcsOptions = {}): string {
  const { schedule } = input
  const zone = eventZone(schedule)
  const start = exportStart(schedule, input.from)
  const end = occurrenceEnd(start, schedule)
  const rrule = buildRrule(schedule)

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    // Identifies the software that produced the file, so it is deliberately NOT the tenant's
    // name — a per-client PRODID would be a claim about who generated the calendar, which is
    // not the same question as whose classes it lists.
    'PRODID:-//SY Developers//Atlas//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    // The calendar's dedupe key, namespaced to the CMS the id comes from.
    //
    // ⚠ **This must stay tenant-independent, and that is a stronger rule
    // than it looks.** The same class can be exported from several client
    // embeds. A visitor might reach it from the national site, and again
    // from a city one, and those have to land in a calendar as one entry.
    // Deriving any part of this from the client would turn each embed into a
    // separate event in somebody's calendar for the same class.
    //
    // The host part is an opaque namespace, not a link, so it is pinned to
    // `cloud.sydevelopers.com`, where the id actually comes from, instead of
    // to whichever origin happens to be serving the widget. That origin is
    // being consolidated (#148), and the canonical is moving to per-owner
    // domains (#156 programme). Neither should be able to change an
    // identifier whose whole job is to stay the same.
    `UID:event-${input.id}@cloud.sydevelopers.com`,
    `DTSTAMP:${utcStamp(DateTime.fromJSDate(options.now ?? new Date()))}`,
    `SUMMARY:${escapeText(input.title)}`,
    `DTSTART;TZID=${zone}:${localStamp(start)}`,
    `DTEND;TZID=${zone}:${localStamp(end)}`,
    ...(rrule ? [`RRULE:${rrule}`] : []),
    ...exclusionDates(schedule).map((dt) => `EXDATE;TZID=${zone}:${localStamp(dt)}`),
    ...(input.location ? [`LOCATION:${escapeText(input.location)}`] : []),
    ...(input.description ? [`DESCRIPTION:${escapeText(input.description)}`] : []),
    // A URI value, not TEXT — no escaping, but strip control chars so an
    // embedded CRLF (which z.string().url() tolerates) cannot inject
    // calendar lines.
    ...(input.url ? [`URL:${input.url.replace(/[\r\n]/g, '')}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return lines.map(fold).join('\r\n') + '\r\n'
}

/** The body text a provider link carries: the blurb, then the event's own page. */
const details = (input: IcsEventInput): string =>
  [input.description, input.url].filter(Boolean).join('\n\n')

/** The Google Calendar "add event" template link — the RRULE rides `recur`. */
export function buildGoogleCalendarUrl(input: IcsEventInput): string {
  const { schedule } = input
  const start = exportStart(schedule, input.from)
  const end = occurrenceEnd(start, schedule)
  const rrule = buildRrule(schedule)

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.title,
    dates: `${localStamp(start)}/${localStamp(end)}`,
    ctz: eventZone(schedule),
  })

  const body = details(input)

  if (body) params.set('details', body)
  if (input.location) params.set('location', input.location)
  if (rrule) params.set('recur', `RRULE:${rrule}`)

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/**
 * Outlook's two deep-link hosts. Same compose endpoint and the same
 * parameters. Only the host differs — `outlook.live.com` is a personal
 * Microsoft account, and `outlook.office.com` is a work/school (Microsoft 365)
 * one. A viewer signed into the wrong one gets asked to sign in, which is why
 * both are offered, rather than this code guessing.
 */
const OUTLOOK_HOSTS = {
  live: 'https://outlook.live.com',
  office: 'https://outlook.office.com',
} as const

export type OutlookFlavor = keyof typeof OUTLOOK_HOSTS

/**
 * An Outlook.com / Office 365 compose link.
 *
 * `startdt`/`enddt` are absolute UTC instants. The compose API takes no
 * timezone parameter, so the instant is the only unambiguous thing to send.
 * Outlook then renders it in the viewer's own calendar timezone, which is
 * what they want to see. It also has **no recurrence parameter**, so this
 * is deliberately a single occurrence anchored by `occurrenceStart`. The
 * ICS download is the lossless path for a series, and the UI says so.
 */
export function buildOutlookCalendarUrl(input: IcsEventInput, flavor: OutlookFlavor): string {
  const { schedule } = input
  const start = occurrenceStart(schedule, input.from)
  const end = occurrenceEnd(start, schedule)

  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: input.title,
    startdt: start.toUTC().toISO() ?? '',
    enddt: end.toUTC().toISO() ?? '',
  })

  const body = details(input)

  if (body) params.set('body', body)
  if (input.location) params.set('location', input.location)

  return `${OUTLOOK_HOSTS[flavor]}/calendar/0/deeplink/compose?${params.toString()}`
}

/**
 * A Yahoo Calendar link. `v=60` is the only version its endpoint accepts.
 * `st`/`et` are UTC stamps. Like Outlook, it carries no recurrence, so it
 * gets the single occurrence the viewer registered for.
 */
export function buildYahooCalendarUrl(input: IcsEventInput): string {
  const { schedule } = input
  const start = occurrenceStart(schedule, input.from)
  const end = occurrenceEnd(start, schedule)

  const params = new URLSearchParams({
    v: '60',
    title: input.title,
    st: utcStamp(start),
    et: utcStamp(end),
  })

  const body = details(input)

  if (body) params.set('desc', body)
  if (input.location) params.set('in_loc', input.location)

  return `https://calendar.yahoo.com/?${params.toString()}`
}

/**
 * A filesystem-safe `.ics` filename for the download. This is ASCII-only: the
 * `download` attribute reaches Windows and Android filesystems with very
 * different ideas about what a filename may contain, and a title is
 * CMS-authored free text in any script. A transliteration library would be a
 * dependency for a filename, so a non-Latin title degrades to the generic
 * name, rather than to mojibake.
 */
export function icsFileName(title: string): string {
  const slug = title
    .normalize('NFKD')
    // Strips combining marks, but only AFTER NFKD has split them off their
    // base letter (so "Méditation" slugs to "meditation", not "m-ditation").
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60)

  return `${slug || 'event'}.ics`
}
