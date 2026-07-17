import type { EventSchedule } from '@/types'

import { describe, it, expect } from 'vitest'

import { buildEventIcs, buildGoogleCalendarUrl, buildRrule, exclusionDates } from './ics'

// Wednesday 19:30–20:45 in Prague; 2026-07-01T17:30Z is 19:30 CEST.
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

    // Series anchors on Wed 1 Jul; the fortnightly Wednesdays are 15 and 29 Jul.
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
    expect(ics).toContain('UID:event-42@atlas.sydevelopers.com')
    expect(ics).toContain('DTSTART;TZID=Europe/Prague:20260701T193000')
    expect(ics).toContain('DTEND;TZID=Europe/Prague:20260701T204500')
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=WE')
    expect(ics).toContain('EXDATE;TZID=Europe/Prague:20260708T193000')
    expect(ics).toContain('LOCATION:5 Market St\\, Cambridge')
    expect(ics).toContain('DTSTAMP:20260717T120000Z')
    // RFC 5545 requires CRLF line endings.
    expect(ics).toContain('\r\n')
  })

  it('omits DTEND and RRULE for an open-ended one-off', () => {
    const ics = buildEventIcs(
      { ...input, schedule: { ...weekly, recurrenceType: null, endTime: null } },
      { now: NOW },
    )

    expect(ics).not.toContain('DTEND')
    expect(ics).not.toContain('RRULE')
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
})
