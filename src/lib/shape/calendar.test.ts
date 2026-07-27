import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'

import {
  computeDayBoundaries,
  eventsToCalendarEntries,
  type CalendarEntry,
  type CalendarSourceEvent,
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
  occurrences: DateTime[]
}): CalendarSourceEvent => ({
  id: opts.id ?? 1,
  title: opts.title ?? 'Meditation',
  path: opts.path ?? '/1',
  eventType: opts.eventType ?? 'offline',
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
      title: 'Meditation',
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

  it('trims occurrences to the active day filter (not just event-level match)', () => {
    // A weekly event with a Monday and a Wednesday occurrence; filter to Mondays only.
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

describe('computeDayBoundaries', () => {
  const entry = (start: string, end: string): CalendarEntry => ({
    id: start,
    title: 'x',
    start,
    end,
    path: '/1',
  })

  it('frames to the events (1h either side) when no time filter is set', () => {
    const entries = [
      entry('2026-07-06 09:30', '2026-07-06 10:30'),
      entry('2026-07-06 14:00', '2026-07-06 15:00'),
    ]

    expect(computeDayBoundaries(entries, [])).toEqual({ start: '08:00', end: '16:00' })
  })

  it('counts an overnight event to the day end', () => {
    const entries = [entry('2026-07-06 23:00', '2026-07-07 00:30')]

    expect(computeDayBoundaries(entries, [])).toEqual({ start: '22:00', end: '24:00' })
  })

  it('is undefined with no entries and no filter', () => {
    expect(computeDayBoundaries([], [])).toBeUndefined()
  })

  it('spans a single selected period, ignoring the events', () => {
    expect(computeDayBoundaries([], ['morning'])).toEqual({ start: '06:00', end: '12:00' })
  })

  it('spans multiple non-wrapping periods from earliest to latest', () => {
    expect(computeDayBoundaries([], ['morning', 'evening'])).toEqual({
      start: '06:00',
      end: '21:00',
    })
  })

  it('frames an overnight (night) period as start > end', () => {
    expect(computeDayBoundaries([], ['night'])).toEqual({ start: '21:00', end: '06:00' })
  })

  it('is undefined when every period is selected (whole day)', () => {
    expect(computeDayBoundaries([], ['morning', 'afternoon', 'evening', 'night'])).toBeUndefined()
  })
})
