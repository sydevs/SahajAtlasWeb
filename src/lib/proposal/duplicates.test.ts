import type { EventSchedule, GeoFeature } from '@/types'

import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'

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
  } = {},
): EventSchedule => {
  const { recurrenceType = 'WEEKLY', endTime = '21:00', count = 6 } = options
  const start = DateTime.fromISO(first, { zone: ZONE })
  const step = recurrenceType === 'MONTHLY' ? { months: 1 } : { weeks: 1 }

  return {
    firstDate: start.toJSDate(),
    firstDate_tz: ZONE,
    endTime,
    recurrenceType,
    upcomingDates: Array.from({ length: recurrenceType ? count : 1 }, (_, index) =>
      start.plus({ [Object.keys(step)[0]]: index }).toJSDate(),
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
const draft = (fields: { firstDate?: string; startTime?: string; endTime?: string } = {}) =>
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
})
