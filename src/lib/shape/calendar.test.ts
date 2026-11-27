import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'

import {
  type CalendarEntry,
  type CalendarSourceEvent,
  calendarViewFromParams,
  calendarWindow,
  daysBetween,
  entriesByDay,
  eventsToCalendarEntries,
  monthGrid,
  shiftWeek,
  calendarViewToParams,
  entryDay,
  entryTime,
  weekFrom,
  tidyPlaceCase,
} from './calendar'
import { DEFAULT_FILTERS, type EventFilters } from './filters'

const at = (zone: string, iso: string) => DateTime.fromISO(iso, { zone })

const makeEvent = (opts: {
  id?: number
  title?: string
  path?: string
  eventType?: 'offline' | 'online'
  zone?: string | null
  endTime?: string | null
  regionName?: string | null
  locality?: string | null
  occurrences: DateTime[]
}): CalendarSourceEvent => ({
  id: opts.id ?? 1,
  title: opts.title ?? 'Meditation',
  path: opts.path ?? '/1',
  eventType: opts.eventType ?? 'offline',
  regionName: opts.regionName ?? null,
  locality: opts.locality ?? null,
  schedule: {
    firstDate: opts.occurrences[0]?.toJSDate() ?? new Date('2026-01-01T00:00:00Z'),
    firstDate_tz: opts.zone === undefined ? 'Asia/Kolkata' : opts.zone,
    endTime: opts.endTime ?? null,
    upcomingDates: opts.occurrences.map((dt) => dt.toJSDate()),
  },
})

// A wide instant window so the fixtures' July occurrences fall inside it.
const RANGE = { from: at('UTC', '2026-07-01T00:00'), to: at('UTC', '2026-12-31T23:59') }

describe('eventsToCalendarEntries', () => {
  it('emits one entry per occurrence, as the event-zone wall-clock', () => {
    const evt = makeEvent({
      zone: 'Asia/Kolkata',
      endTime: '11:00',
      occurrences: [at('Asia/Kolkata', '2026-07-06T09:30'), at('Asia/Kolkata', '2026-07-13T09:30')],
    })
    const entries = eventsToCalendarEntries([evt], DEFAULT_FILTERS, RANGE)

    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      name: 'Meditation',
      start: '2026-07-06 09:30',
      end: '2026-07-06 11:00',
      path: '/1',
    })
    // Ids are unique per occurrence.
    expect(entries[0].id).not.toBe(entries[1].id)
  })

  it('reads online events in the viewer zone', () => {
    const zone = DateTime.local().zoneName ?? 'UTC'
    const evt = makeEvent({
      eventType: 'online',
      zone: null,
      occurrences: [at(zone, '2026-07-06T18:00')],
    })
    const [entry] = eventsToCalendarEntries([evt], DEFAULT_FILTERS, RANGE)

    expect(entry.start).toBe('2026-07-06 18:00')
  })

  it('falls back to a 1h span when endTime is unset', () => {
    const evt = makeEvent({
      zone: 'Asia/Kolkata',
      endTime: null,
      occurrences: [at('Asia/Kolkata', '2026-07-06T09:30')],
    })
    const [entry] = eventsToCalendarEntries([evt], DEFAULT_FILTERS, RANGE)

    expect(entry).toMatchObject({ start: '2026-07-06 09:30', end: '2026-07-06 10:30' })
  })

  it('rolls an endTime before the start to the next day', () => {
    const evt = makeEvent({
      zone: 'Asia/Kolkata',
      endTime: '00:30',
      occurrences: [at('Asia/Kolkata', '2026-07-06T23:00')],
    })
    const [entry] = eventsToCalendarEntries([evt], DEFAULT_FILTERS, RANGE)

    expect(entry).toMatchObject({ start: '2026-07-06 23:00', end: '2026-07-07 00:30' })
  })

  it('excludes occurrences outside the range', () => {
    const evt = makeEvent({
      zone: 'Asia/Kolkata',
      occurrences: [at('Asia/Kolkata', '2026-07-06T09:30'), at('Asia/Kolkata', '2027-01-06T09:30')],
    })
    const entries = eventsToCalendarEntries([evt], DEFAULT_FILTERS, RANGE)

    expect(entries).toHaveLength(1)
    expect(entries[0].start).toBe('2026-07-06 09:30')
  })

  it('contributes nothing for an event with no occurrences', () => {
    expect(
      eventsToCalendarEntries([makeEvent({ occurrences: [] })], DEFAULT_FILTERS, RANGE),
    ).toEqual([])
  })

  it('names the class, with the town it is in', () => {
    const evt = makeEvent({
      title: 'Evening meditation',
      regionName: 'London',
      locality: 'Camden',
      occurrences: [at('Asia/Kolkata', '2026-07-06T09:30')],
    })
    const [entry] = eventsToCalendarEntries([evt], DEFAULT_FILTERS, RANGE)

    expect(entry).toMatchObject({ name: 'Evening meditation', place: 'Camden' })
  })

  it('says where by the address city, and by the region only without one', () => {
    // A region can be a single venue, named for its street.
    const venue = makeEvent({
      regionName: 'R. do Catete, 311',
      locality: 'Rio de Janeiro',
      occurrences: [at('UTC', '2026-07-06T09:30')],
    })
    const noAddress = makeEvent({
      regionName: 'London',
      occurrences: [at('UTC', '2026-07-06T09:30')],
    })

    expect(eventsToCalendarEntries([venue], DEFAULT_FILTERS, RANGE)[0].place).toBe('Rio de Janeiro')
    expect(eventsToCalendarEntries([noAddress], DEFAULT_FILTERS, RANGE)[0].place).toBe('London')
  })

  it('marks an online class, which has no place to name', () => {
    const evt = makeEvent({
      eventType: 'online',
      regionName: 'London',
      occurrences: [at('UTC', '2026-07-06T18:00')],
    })
    const placeless = makeEvent({
      eventType: 'online',
      title: 'Weekly meditation',
      occurrences: [at('UTC', '2026-07-06T18:00')],
    })
    const [entry, bare] = eventsToCalendarEntries([evt, placeless], DEFAULT_FILTERS, RANGE)

    expect(entry).toMatchObject({ place: undefined, online: true })
    expect(bare).toMatchObject({ name: 'Weekly meditation', place: undefined, online: true })
  })

  it('leaves an in-person class with no place untagged, with no place', () => {
    const evt = makeEvent({ title: 'Just the title', occurrences: [at('UTC', '2026-07-06T09:30')] })
    const [entry] = eventsToCalendarEntries([evt], DEFAULT_FILTERS, RANGE)

    expect(entry.online).toBe(false)
    expect(entry.place).toBeUndefined()
  })

  it('names an untitled class by its place, and says the place once', () => {
    const evt = makeEvent({
      title: ' ',
      locality: 'Harrogate',
      occurrences: [at('UTC', '2026-07-06T09:30')],
    })
    const [entry] = eventsToCalendarEntries([evt], DEFAULT_FILTERS, RANGE)

    expect(entry).toMatchObject({ name: 'Harrogate', place: undefined })
  })

  it('recases a town typed all in capitals', () => {
    const evt = makeEvent({ locality: 'HARROGATE', occurrences: [at('UTC', '2026-07-06T09:30')] })

    expect(eventsToCalendarEntries([evt], DEFAULT_FILTERS, RANGE)[0].place).toBe('Harrogate')
  })

  it('builds the online end time from the event-local endTime (converted, not applied in the viewer zone)', () => {
    // Online event in New York (18:00–19:00 local), viewed from the runner's own zone. The
    // span must stay the event's 1 hour. The endTime is applied in the event zone and then
    // converted, not read as `19:00` in the viewer zone (the pre-fix bug).
    const evt = makeEvent({
      eventType: 'online',
      zone: 'America/New_York',
      endTime: '19:00',
      occurrences: [at('America/New_York', '2026-07-06T18:00')],
    })
    const [entry] = eventsToCalendarEntries([evt], DEFAULT_FILTERS, RANGE)
    const start = DateTime.fromFormat(entry.start, 'yyyy-MM-dd HH:mm')
    const end = DateTime.fromFormat(entry.end, 'yyyy-MM-dd HH:mm')

    expect(end.diff(start, 'minutes').minutes).toBe(60)
  })

  it('trims occurrences to the active day filter (not just event-level match)', () => {
    // A weekly event with a Monday and a Wednesday occurrence. Filter to Mondays only.
    // The event matches at the event level, but only its Monday occurrence should show.
    const evt = makeEvent({
      zone: 'Asia/Kolkata',
      endTime: '10:30',
      occurrences: [at('Asia/Kolkata', '2026-07-06T09:30'), at('Asia/Kolkata', '2026-07-08T09:30')],
    })
    const mondaysOnly: EventFilters = { ...DEFAULT_FILTERS, daysOfWeek: [1] }

    const entries = eventsToCalendarEntries([evt], mondaysOnly, RANGE)

    expect(entries).toHaveLength(1)
    expect(entries[0].start).toBe('2026-07-06 09:30')
  })
})

describe('tidyPlaceCase', () => {
  it('recases a name typed all in capitals, keeping its joining words lower case', () => {
    expect(tidyPlaceCase('HARROGATE')).toBe('Harrogate')
    expect(tidyPlaceCase('SOUTHEND-ON-SEA')).toBe('Southend-On-Sea')
    expect(tidyPlaceCase("L'AQUILA")).toBe("L'Aquila")
    expect(tidyPlaceCase("ST JOHN'S")).toBe("St John's")
    expect(tidyPlaceCase('SÃO PAULO')).toBe('São Paulo')
  })

  it('leaves any other name as it was given, and an abbreviation too', () => {
    expect(tidyPlaceCase('NYC')).toBe('NYC')
    expect(tidyPlaceCase('McLean')).toBe('McLean')
    expect(tidyPlaceCase('coventry')).toBe('coventry')
    expect(tidyPlaceCase('東京')).toBe('東京')
  })
})

const entry = (start: string): CalendarEntry => ({
  id: start,
  name: 'x',
  start,
  end: start,
  path: '/1',
  online: false,
})

describe('the Week', () => {
  const today = '2026-11-27'
  const at = (query: string) => calendarWindow(new URLSearchParams(query), today)

  it('opens on the seven days from today, or from its own later day', () => {
    expect(at('')).toEqual({ start: today, end: '2026-12-03', isThisWeek: true })
    expect(at('week=2026-12-10')).toEqual({
      start: '2026-12-10',
      end: '2026-12-16',
      isThisWeek: false,
    })
    // A day that has passed, or no date at all, opens today; a dates filter is not its week.
    expect(at('week=2026-11-01').start).toBe(today)
    expect(at('week=2026-13-40').start).toBe(today)
    expect(at('dates=2026-12-10,2026-12-31').start).toBe(today)
  })

  it('pages a week at a time, and back to this week’s plain address', () => {
    const next = shiftWeek(at(''), 1, today)

    expect(next).toBe('2026-12-04')
    expect(shiftWeek(at(`week=${next}`), -1, today)).toBeNull()
  })

  it('takes its view from the address', () => {
    expect(calendarViewFromParams(new URLSearchParams('view=week'))).toBe('week')
    expect(calendarViewFromParams(new URLSearchParams('view=list'))).toBe('month')
    expect(daysBetween('2026-11-30', '2026-12-02')).toEqual([
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
    ])
  })
})

describe('the Month', () => {
  it('lays a month out in whole weeks from the locale’s first weekday', () => {
    const monday = monthGrid('2026-11-27', 1)
    const sunday = monthGrid('2026-11-27', 7)

    expect(monday[0][0]).toBe('2026-10-26')
    expect(monday.at(-1)?.at(-1)).toBe('2026-12-06')
    expect(sunday[0][0]).toBe('2026-11-01')
    expect(sunday.every((week) => week.length === 7)).toBe(true)
  })

  it('groups entries by their start day, each day in start order', () => {
    const days = entriesByDay([
      entry('2026-11-27 19:00'),
      entry('2026-11-27 09:00'),
      entry('2026-11-28 10:00'),
    ])

    expect(days.get('2026-11-27')?.map((e) => e.start)).toEqual([
      '2026-11-27 09:00',
      '2026-11-27 19:00',
    ])
    expect([...days.keys()]).toEqual(['2026-11-27', '2026-11-28'])
  })
})

describe('the calendar’s own rules', () => {
  const today = '2026-11-27'

  it('opens the Week on a later day, and on this week’s plain address from today or before', () => {
    expect(weekFrom('2026-12-04', today)).toBe('2026-12-04')
    expect(weekFrom(today, today)).toBeNull()
    expect(weekFrom('2026-11-20', today)).toBeNull()
  })

  it('writes the view and its week into the address, and leaves the dates filter alone', () => {
    const params = 'region=gb&dates=2026-12-01%2C2026-12-31'

    expect(calendarViewToParams('week', '2026-12-04', new URLSearchParams(params)).toString()).toBe(
      `${params}&view=week&week=2026-12-04`,
    )
    expect(
      calendarViewToParams('week', null, new URLSearchParams('week=2026-12-04')).toString(),
    ).toBe('view=week')
    expect(
      calendarViewToParams(
        'month',
        null,
        new URLSearchParams(`${params}&view=week&week=2026-12-04`),
      ).toString(),
    ).toBe(params)
  })

  it('reads an entry’s day and its wall clock off its start', () => {
    expect(entryDay({ start: '2026-11-27 19:45' })).toBe('2026-11-27')
    expect(entryTime('2026-11-27 19:45').toFormat('HH:mm')).toBe('19:45')
  })
})
