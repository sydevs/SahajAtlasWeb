import type { EventSchedule, GeoFeature } from '@/types'

import { DateTime } from 'luxon'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { draftPreviewSchedule, possibleDuplicates, schedulesOverlap } from '.'

const ZONE = 'Europe/Paris'
/** A centre's door, and the spot a host's address search lands on, 40 m along the street. */
const DOOR = { longitude: 2.278, latitude: 48.845 }
const NEXT_DOOR: [number, number] = [2.2785, 48.845]

/** A listed class's schedule as the feed carries it: its rule, and its next sessions. */
const listed = (
  first: string,
  options: {
    recurrenceType?: EventSchedule['recurrenceType']
    endTime?: string | null
    count?: number
    /** Every this many weeks (or months): 2 is fortnightly. */
    interval?: number
  } = {},
): EventSchedule => {
  const { recurrenceType = 'WEEKLY', endTime = '21:00', count = 6, interval = 1 } = options
  const start = DateTime.fromISO(first, { zone: ZONE })
  const unit = recurrenceType === 'MONTHLY' ? 'months' : 'weeks'

  return {
    firstDate: start.toJSDate(),
    firstDate_tz: ZONE,
    endTime,
    recurrenceType,
    interval,
    upcomingDates: Array.from({ length: recurrenceType ? count : 1 }, (_, index) =>
      start.plus({ [unit]: index * interval }).toJSDate(),
    ),
  }
}

const feature = (
  id: number,
  schedule: EventSchedule | null,
  overrides: Partial<GeoFeature['properties']> = {},
  at: [number, number] = NEXT_DOOR,
): GeoFeature => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: at },
  properties: {
    id,
    eventType: 'offline',
    languages: ['fr'],
    schedule,
    region: { id: 1 } as GeoFeature['properties']['region'],
    ...overrides,
  },
})

/** A new weekly class, starting on a Tuesday in January, 18:00 to 19:30. */
const draft = (
  fields: {
    firstDate?: string
    startTime?: string
    endTime?: string
    endDate?: string
    timeZone?: string
  } = {},
) =>
  draftPreviewSchedule({
    firstDate: '2027-01-05',
    startTime: '18:00',
    endTime: '19:30',
    repeats: 'weekly',
    monthlyBy: 'date',
    endDate: '',
    timeZone: ZONE,
    ...fields,
  })!

// The Paris centre in the live feed runs a class at one door every day of the week.
const parisWeek = [
  feature(1143, listed('2026-11-16T17:00')), // Monday
  feature(1144, listed('2026-11-17T17:00')), // Tuesday, 17:00–21:00
  feature(1145, listed('2026-11-18T17:00')), // Wednesday
]

describe('possibleDuplicates', () => {
  it('names the class at the same door that meets at the same time', () => {
    const found = possibleDuplicates(DOOR, draft(), parisWeek)

    expect(found.map(({ properties }) => properties.id)).toEqual([1144])
  })

  it('does not name classes at the same door on other days', () => {
    // A Thursday class at the centre clashes with nothing listed there.
    expect(possibleDuplicates(DOOR, draft({ firstDate: '2027-01-07' }), parisWeek)).toEqual([])
  })

  it('does not name a class on the same day at hours that do not overlap', () => {
    const morning = draft({ startTime: '09:00', endTime: '10:30' })

    expect(possibleDuplicates(DOOR, morning, parisWeek)).toEqual([])
  })

  it('does not name a class at the same time further down the road', () => {
    const away = feature(9, listed('2026-11-17T17:00'), {}, [2.29, 48.845])

    expect(possibleDuplicates(DOOR, draft(), [away])).toEqual([])
  })

  it('leaves out online, by-request and finished classes', () => {
    const tuesday = listed('2026-11-17T17:00')
    const finished = { ...tuesday, upcomingDates: [] }

    expect(
      possibleDuplicates(DOOR, draft(), [
        feature(1, tuesday, { eventType: 'online' }),
        feature(2, tuesday, { inactive: true }),
        feature(3, null),
        feature(4, finished),
      ]),
    ).toEqual([])
  })

  it('checks nothing for an online class, or before the schedule is known', () => {
    expect(possibleDuplicates(null, draft(), parisWeek)).toEqual([])
    expect(possibleDuplicates(DOOR, null, parisWeek)).toEqual([])
  })
})

describe('schedulesOverlap', () => {
  it('counts a listed class with no end time as an hour long', () => {
    const noEnd = listed('2026-11-17T19:00', { endTime: null })

    expect(schedulesOverlap(draft({ startTime: '19:45', endTime: '20:30' }), noEnd)).toBe(true)
    expect(schedulesOverlap(draft({ startTime: '20:00', endTime: '21:00' }), noEnd)).toBe(false)
  })

  it('compares a one-off class by its date, not its weekday', () => {
    const oneOff = (date: string) =>
      draftPreviewSchedule({
        firstDate: date,
        startTime: '18:00',
        endTime: '19:00',
        repeats: 'once',
        monthlyBy: 'date',
        endDate: '',
        timeZone: ZONE,
      })!
    const weekly = listed('2027-01-05T17:00')

    // On a Tuesday the weekly class meets, at its hours.
    expect(schedulesOverlap(oneOff('2027-01-12'), weekly)).toBe(true)
    // A Tuesday after the listed sessions run out is not a clash anyone can see yet.
    expect(schedulesOverlap(oneOff('2028-06-06'), weekly)).toBe(false)
  })

  it('catches a late class running past midnight into the next week', () => {
    const late = listed('2026-11-22T23:00', { endTime: '01:00' }) // Sunday 23:00–01:00
    const earlyMonday = draft({ firstDate: '2027-01-04', startTime: '00:30', endTime: '01:30' })

    expect(schedulesOverlap(earlyMonday, late)).toBe(true)
  })

  // A centre can run two fortnightly classes at one door on the same evening, on alternate weeks:
  // they never meet, so neither duplicates the other.
  it('compares fortnightly classes week by week', () => {
    const oddWeeks = listed('2026-11-17T19:00', { interval: 2 }) // Tuesdays 17 Nov, 1 Dec…
    const evenWeeks = listed('2026-11-24T19:00', { interval: 2 }) // Tuesdays 24 Nov, 8 Dec…
    const sameWeeks = listed('2027-01-12T19:00', { interval: 2 }) // in step with the first

    expect(schedulesOverlap(oddWeeks, evenWeeks)).toBe(false)
    expect(schedulesOverlap(oddWeeks, sameWeeks)).toBe(true)
  })

  // A course has an end, so a class at its hours that starts after it never meets it.
  it('does not flag a course that ends before the new class starts', () => {
    const course = (ending: Pick<EventSchedule, 'endingType' | 'count' | 'untilDate'>) => ({
      ...listed('2026-11-03T18:00', { count: 6 }), // Tuesdays 3 Nov to 8 Dec, 18:00–21:00
      ...ending,
    })
    const byDate = course({ endingType: 'until', untilDate: new Date('2026-12-08T12:00:00Z') })
    const byCount = course({ endingType: 'count', count: 6 })
    const december = draft({ firstDate: '2026-12-08' })

    expect(schedulesOverlap(draft(), byDate)).toBe(false)
    expect(schedulesOverlap(draft(), byCount)).toBe(false)
    // Starting on the course's last evening, it does meet it.
    expect(schedulesOverlap(december, byDate)).toBe(true)
    expect(schedulesOverlap(december, byCount)).toBe(true)
    // Nor does a new course that ends before a listed class starts.
    expect(
      schedulesOverlap(
        draft({ firstDate: '2026-11-03', endDate: '2026-12-01' }),
        listed('2027-01-05T18:00'),
      ),
    ).toBe(false)
  })

  // A course's first and last weeks can be partial, so its ends are read by the day.
  it('does not flag a course that ends the day before the other class meets', () => {
    // Tuesdays 3 to 24 Nov, until Monday 30 Nov.
    const course = {
      ...listed('2026-11-03T18:00', { count: 4 }),
      endingType: 'until' as const,
      untilDate: new Date('2026-11-30T00:00:00Z'),
    }
    const newCourse = draft({ firstDate: '2026-11-03', endDate: '2026-11-30' })

    expect(schedulesOverlap(draft({ firstDate: '2026-12-01' }), course)).toBe(false)
    expect(schedulesOverlap(draft({ firstDate: '2026-11-24' }), course)).toBe(true)
    // A new course ending on that Monday, against a listed class from Tuesday 1 Dec.
    expect(schedulesOverlap(newCourse, listed('2026-12-01T18:00'))).toBe(false)
  })

  it('does not flag a class that starts later in the week a course ends', () => {
    // Meets on Tuesdays from 8 Dec; its first date is Wednesday 2 Dec.
    const tuesdays = listed('2026-12-08T18:00')
    const fromWednesday = {
      ...tuesdays,
      firstDate: DateTime.fromISO('2026-12-02T18:00', { zone: ZONE }).toJSDate(),
    }
    const endsTuesday = draft({ firstDate: '2026-11-03', endDate: '2026-12-01' })
    const endsNextTuesday = draft({ firstDate: '2026-11-03', endDate: '2026-12-08' })

    expect(schedulesOverlap(endsTuesday, fromWednesday)).toBe(false)
    expect(schedulesOverlap(endsNextTuesday, fromWednesday)).toBe(true)
  })

  it('reads an until date by its UTC day, as SahajCloud does, west of UTC too', () => {
    const toronto = 'America/Toronto'
    const start = DateTime.fromISO('2026-11-02T18:00', { zone: toronto })
    // Mondays 2 to 30 Nov, stored as midnight UTC on 30 Nov: Sunday evening in Toronto.
    const course: EventSchedule = {
      firstDate: start.toJSDate(),
      firstDate_tz: toronto,
      endTime: '21:00',
      recurrenceType: 'WEEKLY',
      interval: 1,
      endingType: 'until',
      untilDate: new Date('2026-11-30T00:00:00Z'),
      upcomingDates: [0, 1, 2, 3, 4].map((week) => start.plus({ weeks: week }).toJSDate()),
    }

    expect(schedulesOverlap(draft({ firstDate: '2026-11-30', timeZone: toronto }), course)).toBe(
      true,
    )
  })

  it('still flags a fortnightly class against a weekly one on its evening', () => {
    const fortnightly = listed('2026-11-24T19:00', { interval: 2 })

    expect(schedulesOverlap(draft({ startTime: '19:30', endTime: '20:30' }), fortnightly)).toBe(
      true,
    )
  })
})

// A draft's own end date goes out as SahajCloud reads it, so its last day holds on any clock.
describe('a new course’s own end date', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /** A class listed in `zone`, weekly at 18:00 from `first`. */
  const weekly = (first: string, zone: string): EventSchedule => {
    const start = DateTime.fromISO(first, { zone })

    return {
      firstDate: start.toJSDate(),
      firstDate_tz: zone,
      endTime: '21:00',
      recurrenceType: 'WEEKLY',
      interval: 1,
      upcomingDates: [0, 1, 2, 3, 4, 5].map((week) => start.plus({ weeks: week }).toJSDate()),
    }
  }

  it.each(['America/Toronto', 'Pacific/Auckland'])('ends on the chosen day in %s', (timeZone) => {
    // Both end on Monday 30 Nov: Tuesdays from 3 Nov, and Mondays from 2 Nov.
    const tuesdays = draft({ firstDate: '2026-11-03', endDate: '2026-11-30', timeZone })
    const mondays = draft({ firstDate: '2026-11-02', endDate: '2026-11-30', timeZone })

    expect(schedulesOverlap(tuesdays, weekly('2026-12-01T18:00', timeZone))).toBe(false)
    expect(schedulesOverlap(mondays, weekly('2026-11-30T18:00', timeZone))).toBe(true)
  })
})
