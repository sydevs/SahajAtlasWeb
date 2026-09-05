import type { EventSchedule } from '@/types'

import { describe, it, expect } from 'vitest'

import {
  buildEventIcs,
  buildGoogleCalendarUrl,
  buildOutlookCalendarUrl,
  buildRrule,
  buildYahooCalendarUrl,
  exclusionDates,
  icsFileName,
} from './ics'

// Wednesday 19:30–20:45 in Prague. 2026-07-01T17:30Z is 19:30 CEST.
const weekly: EventSchedule = {
  firstDate: new Date('2026-07-01T17:30:00Z'),
  firstDate_tz: 'Europe/Prague',
  endTime: '20:45',
  recurrenceType: 'WEEKLY',
  interval: 1,
  weekdays: ['WE'],
}

const input = { id: 42, title: 'Evening Meditation', schedule: weekly }
const NOW = new Date('2026-07-17T12:00:00Z')
// A session further into the series than its start — what the registration
// confirmation knows and passes as `from`.
const SESSION = new Date('2026-07-29T17:30:00Z')

describe('buildRrule', () => {
  it('is null for a one-off', () => {
    expect(buildRrule({ ...weekly, recurrenceType: null })).toBeNull()
  })

  it('weekly single day', () => {
    expect(buildRrule(weekly)).toBe('FREQ=WEEKLY;BYDAY=WE')
  })

  it('weekly multi-day', () => {
    expect(buildRrule({ ...weekly, weekdays: ['MO', 'WE'] })).toBe('FREQ=WEEKLY;BYDAY=MO,WE')
  })

  it('every N weeks', () => {
    expect(buildRrule({ ...weekly, interval: 2 })).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=WE')
    expect(buildRrule({ ...weekly, interval: 3 })).toBe('FREQ=WEEKLY;INTERVAL=3;BYDAY=WE')
  })

  it('daily with interval', () => {
    expect(buildRrule({ ...weekly, recurrenceType: 'DAILY', interval: 3 })).toBe(
      'FREQ=DAILY;INTERVAL=3',
    )
  })

  it('monthly by date', () => {
    expect(
      buildRrule({ ...weekly, recurrenceType: 'MONTHLY', monthlyMode: 'date', monthDay: 15 }),
    ).toBe('FREQ=MONTHLY;BYMONTHDAY=15')
  })

  it('monthly by date falls back to the first-session day of month', () => {
    expect(
      buildRrule({ ...weekly, recurrenceType: 'MONTHLY', monthlyMode: 'date', monthDay: null }),
    ).toBe('FREQ=MONTHLY;BYMONTHDAY=1')
  })

  it('monthly by weekday, including last-of-month', () => {
    expect(
      buildRrule({
        ...weekly,
        recurrenceType: 'MONTHLY',
        monthlyMode: 'weekday',
        weekNumber: '1',
        weekdayOfMonth: 'SU',
      }),
    ).toBe('FREQ=MONTHLY;BYDAY=1SU')
    expect(
      buildRrule({
        ...weekly,
        recurrenceType: 'MONTHLY',
        monthlyMode: 'weekday',
        weekNumber: '-1',
        weekdayOfMonth: 'FR',
      }),
    ).toBe('FREQ=MONTHLY;BYDAY=-1FR')
  })

  it('bounded course by count', () => {
    expect(buildRrule({ ...weekly, endingType: 'count', count: 8 })).toBe(
      'FREQ=WEEKLY;BYDAY=WE;COUNT=8',
    )
  })

  it('bounded course by until — UTC stamp of the event-zone end of day', () => {
    // End of 2026-08-26 in Prague (CEST, UTC+2) is 21:59:59Z.
    expect(
      buildRrule({ ...weekly, endingType: 'until', untilDate: new Date('2026-08-26T00:00:00Z') }),
    ).toBe('FREQ=WEEKLY;BYDAY=WE;UNTIL=20260826T215959Z')
  })

  it('until-day survives zones west of the stored midnight stamp', () => {
    // A date-only value stored as midnight UTC read in New York (UTC-4) must
    // still mean Aug 26 — naively it lands on Aug 25 and drops the last session.
    const ny = buildRrule({
      ...weekly,
      firstDate_tz: 'America/New_York',
      endingType: 'until',
      untilDate: new Date('2026-08-26T00:00:00Z'),
    })

    // End of Aug 26 in New York (EDT, UTC-4) is 03:59:59Z on the 27th.
    expect(ny).toBe('FREQ=WEEKLY;BYDAY=WE;UNTIL=20260827T035959Z')
  })

  it('ignores stale ending fields the discriminator does not select', () => {
    // The CMS form leaves `count` populated on until-ended schedules.
    expect(
      buildRrule({
        ...weekly,
        endingType: 'until',
        count: 10,
        untilDate: new Date('2026-08-26T00:00:00Z'),
      }),
    ).not.toContain('COUNT')
  })
})

describe('exclusionDates', () => {
  it('expands a window to the pattern occurrences at the local start time', () => {
    const schedule: EventSchedule = {
      ...weekly,
      exclusions: [
        { startDate: new Date('2026-08-01T00:00:00Z'), endDate: new Date('2026-08-31T00:00:00Z') },
      ],
    }

    // August 2026 Wednesdays: 5, 12, 19, 26 — each at 19:30 Prague time.
    expect(exclusionDates(schedule).map((d) => d.toFormat('yyyy-MM-dd HH:mm'))).toEqual([
      '2026-08-05 19:30',
      '2026-08-12 19:30',
      '2026-08-19 19:30',
      '2026-08-26 19:30',
    ])
  })

  it('keeps the LOCAL start time constant across a DST boundary', () => {
    // Prague leaves CET (+1) for CEST (+2) on 2026-03-29. A window spanning the
    // switch must keep every excluded occurrence at 19:30 wall-clock time.
    const winterSeries: EventSchedule = {
      ...weekly,
      firstDate: new Date('2026-01-07T18:30:00Z'), // 19:30 CET
      exclusions: [
        { startDate: new Date('2026-03-24T00:00:00Z'), endDate: new Date('2026-04-02T00:00:00Z') },
      ],
    }
    const dates = exclusionDates(winterSeries)

    expect(dates.map((d) => d.toFormat('yyyy-MM-dd HH:mm ZZ'))).toEqual([
      '2026-03-25 19:30 +01:00',
      '2026-04-01 19:30 +02:00',
    ])
  })

  it('honours interval alignment when expanding fortnightly patterns', () => {
    const fortnightly: EventSchedule = {
      ...weekly,
      interval: 2,
      exclusions: [
        { startDate: new Date('2026-07-02T00:00:00Z'), endDate: new Date('2026-07-31T00:00:00Z') },
      ],
    }

    // Series anchors on Wed 1 Jul. The fortnightly Wednesdays are 15 and 29 Jul.
    expect(exclusionDates(fortnightly).map((d) => d.toFormat('yyyy-MM-dd'))).toEqual([
      '2026-07-15',
      '2026-07-29',
    ])
  })

  it('a single-day exclusion needs no endDate', () => {
    const schedule: EventSchedule = {
      ...weekly,
      exclusions: [{ startDate: new Date('2026-07-08T00:00:00Z') }],
    }

    expect(exclusionDates(schedule).map((d) => d.toFormat('yyyy-MM-dd'))).toEqual(['2026-07-08'])
  })

  it('exclusion days survive zones west of the stored midnight stamp', () => {
    // Wednesday series in New York. The excluded day is stored as midnight
    // UTC. Naively that instant is Tuesday evening in NY, and no EXDATE
    // would match.
    const ny: EventSchedule = {
      ...weekly,
      firstDate: new Date('2026-07-01T23:30:00Z'), // Wed 19:30 EDT
      firstDate_tz: 'America/New_York',
      exclusions: [{ startDate: new Date('2026-07-08T00:00:00Z') }],
    }

    expect(exclusionDates(ny).map((d) => d.toFormat('yyyy-MM-dd HH:mm'))).toEqual([
      '2026-07-08 19:30',
    ])
  })

  it('monthly by-weekday exclusions match the nth weekday only', () => {
    const monthly: EventSchedule = {
      ...weekly,
      recurrenceType: 'MONTHLY',
      monthlyMode: 'weekday',
      weekNumber: '1',
      weekdayOfMonth: 'WE',
      exclusions: [
        { startDate: new Date('2026-08-01T00:00:00Z'), endDate: new Date('2026-08-31T00:00:00Z') },
      ],
    }

    // Only the FIRST Wednesday of August (the 5th) is a pattern occurrence.
    expect(exclusionDates(monthly).map((d) => d.toFormat('yyyy-MM-dd'))).toEqual(['2026-08-05'])
  })
})

describe('buildEventIcs', () => {
  it('emits a TZID-anchored series with RRULE and EXDATE', () => {
    const ics = buildEventIcs(
      {
        ...input,
        location: '5 Market St, Cambridge',
        url: 'https://atlas.example/united-kingdom/cambridge/42',
        schedule: {
          ...weekly,
          exclusions: [{ startDate: new Date('2026-07-08T00:00:00Z') }],
        },
      },
      { now: NOW },
    )

    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('UID:event-42@cloud.sydevelopers.com')

    // This asserts the rule the UID exists to satisfy, rather than only
    // describing it. The same event exported from two different client
    // embeds must produce the same identifier, or a visitor who reaches one
    // class from the national site, and again from a city one, gets two
    // calendar entries for it. Nothing tenant-derived may enter this string.
    expect(ics).not.toMatch(/UID:[^\r\n]*(sahajatlas|sahajayoga|wemeditate)/i)
    expect(ics).toContain('DTSTART;TZID=Europe/Prague:20260701T193000')
    expect(ics).toContain('DTEND;TZID=Europe/Prague:20260701T204500')
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=WE')
    expect(ics).toContain('EXDATE;TZID=Europe/Prague:20260708T193000')
    expect(ics).toContain('LOCATION:5 Market St\\, Cambridge')
    expect(ics).toContain('DTSTAMP:20260717T120000Z')
    // RFC 5545 requires CRLF line endings.
    expect(ics).toContain('\r\n')
  })

  it('omits RRULE for a one-off, and defaults its length to an hour', () => {
    const ics = buildEventIcs(
      { ...input, schedule: { ...weekly, recurrenceType: null, endTime: null } },
      { now: NOW },
    )

    expect(ics).not.toContain('RRULE')
    // No `endTime` on the schedule. A bare DTSTART is RFC-legal, but means a
    // zero-length event (RFC 5545 §3.6.1), and every calendar app draws that
    // as a hairline. So it falls back to the same hour SahajCloud's own ICS
    // builder uses, and the two descriptions of one class agree.
    expect(ics).toContain('DTSTART;TZID=Europe/Prague:20260701T193000')
    expect(ics).toContain('DTEND;TZID=Europe/Prague:20260701T203000')
  })

  it('escapes and folds long text values', () => {
    const ics = buildEventIcs(
      { ...input, description: `line one\nline two, with; ${'x'.repeat(200)}` },
      { now: NOW },
    )

    expect(ics).toContain('\\nline two\\, with\\;')
    // Folded continuation lines start with a single space.
    expect(ics).toMatch(/\r\n [^\r\n]/)
  })

  it('folds by UTF-8 octets and never splits a multi-byte character', () => {
    // Cyrillic is 2 bytes per character in UTF-8. Code-unit folding would
    // emit about 148-octet lines, and a code-point boundary must never fall
    // inside a character.
    const ics = buildEventIcs({ ...input, description: 'д'.repeat(120) }, { now: NOW })
    const encoder = new TextEncoder()

    for (const line of ics.split('\r\n')) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75)
    }
    // Unfolding restores the original text intact (no split characters).
    expect(ics.replace(/\r\n /g, '')).toContain('д'.repeat(120))
  })

  it('strips CR/LF from the URL line (line-injection guard)', () => {
    const ics = buildEventIcs(
      { ...input, url: 'https://atlas.example/42\r\nATTENDEE:mailto:x@y.z' },
      { now: NOW },
    )

    // The CRLF is gone, so the payload stays inert inside the URL value — no
    // line of the file starts with the injected property.
    expect(ics.split('\r\n').some((line) => line.startsWith('ATTENDEE'))).toBe(false)
    expect(ics).toContain('URL:https://atlas.example/42ATTENDEE')
  })

  it('anchors a one-off at its next upcoming occurrence (rescheduling drift)', () => {
    const ics = buildEventIcs(
      {
        ...input,
        schedule: {
          ...weekly,
          recurrenceType: null,
          upcomingDates: [new Date('2026-07-15T17:30:00Z')],
        },
      },
      { now: NOW },
    )

    // firstDate says 1 Jul, but the real (rescheduled) occurrence is 15 Jul.
    expect(ics).toContain('DTSTART;TZID=Europe/Prague:20260715T193000')
  })
})

describe('buildGoogleCalendarUrl', () => {
  it('carries event-local dates, the event timezone, and the RRULE', () => {
    const url = new URL(buildGoogleCalendarUrl(input))

    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
    expect(url.searchParams.get('dates')).toBe('20260701T193000/20260701T204500')
    expect(url.searchParams.get('ctz')).toBe('Europe/Prague')
    expect(url.searchParams.get('recur')).toBe('RRULE:FREQ=WEEKLY;BYDAY=WE')
  })

  it('stays anchored on the SERIES start even when a session is given', () => {
    // Google carries the RRULE, so DTSTART is the instance COUNT/BYDAY are
    // reckoned from. Re-anchoring it on session five of a course would hand the
    // importer five more sessions starting there.
    const url = new URL(buildGoogleCalendarUrl({ ...input, from: SESSION }))

    expect(url.searchParams.get('dates')).toBe('20260701T193000/20260701T204500')
  })
})

// The three providers below take no recurrence parameter. None of their URL
// APIs has one, so each gets a single occurrence, and the whole question is
// which one. This is never the series start: a class running since 2019
// would drop a 2019 date into the viewer's calendar and call it done.
describe('recurrence-less providers anchor on the right occurrence', () => {
  const longRunning: EventSchedule = {
    ...weekly,
    firstDate: new Date('2019-01-02T18:30:00Z'),
    upcomingDates: [new Date('2026-07-22T17:30:00Z')],
  }

  it('outlook uses the registered session when there is one', () => {
    const url = new URL(buildOutlookCalendarUrl({ ...input, from: SESSION }, 'live'))

    // 2026-07-29 19:30 Prague (CEST, UTC+2) is 17:30Z.
    expect(url.searchParams.get('startdt')).toBe('2026-07-29T17:30:00.000Z')
    expect(url.searchParams.get('enddt')).toBe('2026-07-29T18:45:00.000Z')
  })

  it('outlook falls back to the next upcoming occurrence, not the 2019 start', () => {
    const url = new URL(buildOutlookCalendarUrl({ ...input, schedule: longRunning }, 'live'))

    expect(url.searchParams.get('startdt')).toBe('2026-07-22T17:30:00.000Z')
    expect(url.searchParams.get('startdt')).not.toContain('2019')
  })

  it('yahoo does the same, in its own stamp format', () => {
    const url = new URL(buildYahooCalendarUrl({ ...input, schedule: longRunning }))

    expect(url.searchParams.get('v')).toBe('60')
    expect(url.searchParams.get('st')).toBe('20260722T173000Z')
    expect(url.searchParams.get('et')).toBe('20260722T184500Z')
  })
})

describe('buildOutlookCalendarUrl', () => {
  it('composes against the personal or the work host', () => {
    expect(buildOutlookCalendarUrl(input, 'live')).toContain(
      'https://outlook.live.com/calendar/0/deeplink/compose',
    )
    expect(buildOutlookCalendarUrl(input, 'office')).toContain(
      'https://outlook.office.com/calendar/0/deeplink/compose',
    )
  })

  it('carries the compose parameters Outlook requires', () => {
    const url = new URL(
      buildOutlookCalendarUrl(
        { ...input, location: '5 Market St, Cambridge', url: 'https://atlas.example/42' },
        'live',
      ),
    )

    expect(url.searchParams.get('path')).toBe('/calendar/action/compose')
    expect(url.searchParams.get('rru')).toBe('addevent')
    expect(url.searchParams.get('subject')).toBe('Evening Meditation')
    expect(url.searchParams.get('location')).toBe('5 Market St, Cambridge')
    expect(url.searchParams.get('body')).toBe('https://atlas.example/42')
  })
})

describe('buildYahooCalendarUrl', () => {
  it('carries the title, UTC stamps and the location', () => {
    const url = new URL(
      buildYahooCalendarUrl({ ...input, location: 'Prague', description: 'Free class' }),
    )

    expect(url.origin + url.pathname).toBe('https://calendar.yahoo.com/')
    expect(url.searchParams.get('title')).toBe('Evening Meditation')
    expect(url.searchParams.get('in_loc')).toBe('Prague')
    expect(url.searchParams.get('desc')).toBe('Free class')
  })
})

describe('icsFileName', () => {
  it('slugs a title to an ASCII filename', () => {
    expect(icsFileName('Evening Meditation')).toBe('evening-meditation.ics')
  })

  it('folds accents onto their base letters rather than dropping them', () => {
    expect(icsFileName('Méditation du soir')).toBe('meditation-du-soir.ics')
  })

  it('degrades a title with no Latin characters to a generic name', () => {
    // This avoids emitting mojibake, or an empty name, into a Windows or
    // Android filesystem. Transliterating properly would be a dependency for
    // a filename.
    expect(icsFileName('瞑想')).toBe('event.ics')
  })

  it('bounds the length and never leaves a trailing separator', () => {
    const name = icsFileName('x'.repeat(200))

    expect(name.length).toBeLessThanOrEqual(64)
    expect(name).not.toContain('-.ics')
  })
})
