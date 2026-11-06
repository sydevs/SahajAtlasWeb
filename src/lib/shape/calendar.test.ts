import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'

import {
  CALENDAR_VIEW_LIST,
  CALENDAR_VIEW_MONTH,
  CALENDAR_VIEW_MONTH_AGENDA,
  CALENDAR_VIEW_WEEK,
  computeDayBoundaries,
  eventsToCalendarEntries,
  calendarWindow,
  groupEntriesByDay,
  chosenCalendarFilters,
  shiftCalendarWindow,
  isCalendarViewOption,
  resolveCalendarView,
  tidyPlaceCase,
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

  it('names the class first and its city second', () => {
    const evt = makeEvent({
      title: 'Weekly Sahaja Yoga meditation for beginners',
      regionName: 'London',
      locality: 'Camden',
      occurrences: [at('Asia/Kolkata', '2026-07-06T09:30')],
    })
    const [entry] = eventsToCalendarEntries([evt], DEFAULT_FILTERS, RANGE)

    expect(entry.name).toBe('Weekly Sahaja Yoga meditation for beginners')
    expect(entry.detail).toBe('Camden')
    expect(entry.title).toBe('Weekly Sahaja Yoga meditation for beginners\nCamden')
  })

  it('reads the same when the calendar is scoped to a region', () => {
    const evt = makeEvent({
      title: 'Weekly Sahaja Yoga meditation for beginners',
      regionName: 'London',
      locality: 'Camden',
      occurrences: [at('Asia/Kolkata', '2026-07-06T09:30')],
    })
    const scoped: EventFilters = { ...DEFAULT_FILTERS, region: 'london' }

    const [entry] = eventsToCalendarEntries([evt], scoped, RANGE)

    expect(entry.detail).toBe('Camden')
  })

  it('puts the "Online" term in the location (not the title) and tags its calendar', () => {
    const evt = makeEvent({
      eventType: 'online',
      regionName: 'London',
      occurrences: [at('UTC', '2026-07-06T18:00')],
    })
    const [entry] = eventsToCalendarEntries([evt], DEFAULT_FILTERS, {
      ...RANGE,
      onlineLabel: 'Online',
    })

    // The class name leads. "Online" is written on the second line, and rides the location
    // field for the week view, which shows it.
    expect(entry.title).toBe('Meditation\nLondon · Online')
    expect(entry.location).toBe('Online')
    expect(entry.calendarId).toBe('online')

    // Placeless online → the second line is just the mode.
    const placeless = makeEvent({
      eventType: 'online',
      title: 'Weekly meditation',
      occurrences: [at('UTC', '2026-07-06T18:00')],
    })
    const [bare] = eventsToCalendarEntries([placeless], DEFAULT_FILTERS, {
      ...RANGE,
      onlineLabel: 'Online',
    })

    expect(bare.title).toBe('Weekly meditation\nOnline')
    expect(bare.location).toBe('Online')
  })

  it('leaves offline entries untagged (no calendarId, no location)', () => {
    const evt = makeEvent({ regionName: 'London', occurrences: [at('UTC', '2026-07-06T09:30')] })
    const [entry] = eventsToCalendarEntries([evt], DEFAULT_FILTERS, RANGE)

    expect(entry.calendarId).toBeUndefined()
    expect(entry.location).toBeUndefined()
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

  it('falls back to the region for the place, and keeps a place the name also says', () => {
    const noLocality = makeEvent({
      regionName: 'London',
      occurrences: [at('UTC', '2026-07-06T09:30')],
    })
    const named = makeEvent({
      title: 'Evening Meditation at Regina',
      regionName: 'Regina',
      occurrences: [at('UTC', '2026-07-06T09:30')],
    })
    const bare = makeEvent({
      title: 'Just the title',
      occurrences: [at('UTC', '2026-07-06T09:30')],
    })

    expect(eventsToCalendarEntries([noLocality], DEFAULT_FILTERS, RANGE)[0].detail).toBe('London')
    expect(eventsToCalendarEntries([named], DEFAULT_FILTERS, RANGE)[0].detail).toBe('Regina')
    expect(eventsToCalendarEntries([bare], DEFAULT_FILTERS, RANGE)[0].title).toBe('Just the title')
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

describe('computeDayBoundaries', () => {
  const entry = (start: string, end: string): CalendarEntry => ({
    id: start,
    title: 'x',
    name: 'x',
    start,
    end,
    path: '/1',
    zone: 'Europe/London',
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
      end: '24:00',
    })
  })

  it('frames evening up to midnight', () => {
    expect(computeDayBoundaries([], ['evening'])).toEqual({ start: '17:00', end: '24:00' })
  })

  it('frames 6 to midnight when all three periods are selected', () => {
    expect(computeDayBoundaries([], ['morning', 'afternoon', 'evening'])).toEqual({
      start: '06:00',
      end: '24:00',
    })
  })
})

describe('isCalendarViewOption', () => {
  it('accepts the three the switch offers', () => {
    expect(isCalendarViewOption(CALENDAR_VIEW_MONTH)).toBe(true)
    expect(isCalendarViewOption(CALENDAR_VIEW_WEEK)).toBe(true)
    expect(isCalendarViewOption(CALENDAR_VIEW_LIST)).toBe(true)
  })

  // The one name the store must never hold: it renders FOR Month and the switch has no item
  // for it, so a stored `month-agenda` would light nothing.
  it('refuses the month agenda', () => {
    expect(isCalendarViewOption(CALENDAR_VIEW_MONTH_AGENDA)).toBe(false)
  })

  // Radix reports a deselect as the empty string, which is what the guard replaced.
  it('refuses an empty value and an unknown name', () => {
    expect(isCalendarViewOption('')).toBe(false)
    expect(isCalendarViewOption('day')).toBe(false)
  })
})

describe('resolveCalendarView', () => {
  it('renders what the viewer picked at or above the crossing', () => {
    expect(resolveCalendarView(CALENDAR_VIEW_MONTH, true)).toEqual({
      view: CALENDAR_VIEW_MONTH,
      option: CALENDAR_VIEW_MONTH,
    })
    expect(resolveCalendarView(CALENDAR_VIEW_WEEK, true)).toEqual({
      view: CALENDAR_VIEW_WEEK,
      option: CALENDAR_VIEW_WEEK,
    })
  })

  it('collapses month onto the month agenda below the crossing, still lighting Month', () => {
    expect(resolveCalendarView(CALENDAR_VIEW_MONTH, false)).toEqual({
      view: CALENDAR_VIEW_MONTH_AGENDA,
      option: CALENDAR_VIEW_MONTH,
    })
  })

  it('collapses week onto the month agenda below the crossing, where Week is not offered', () => {
    expect(resolveCalendarView(CALENDAR_VIEW_WEEK, false)).toEqual({
      view: CALENDAR_VIEW_MONTH_AGENDA,
      option: CALENDAR_VIEW_MONTH,
    })
  })

  it('passes the list view through at either width', () => {
    for (const isWide of [true, false]) {
      expect(resolveCalendarView(CALENDAR_VIEW_LIST, isWide)).toEqual({
        view: CALENDAR_VIEW_LIST,
        option: CALENDAR_VIEW_LIST,
      })
    }
  })

  it('treats an unset store as month, so a fresh phone mount renders the agenda', () => {
    expect(resolveCalendarView(null, true).view).toBe(CALENDAR_VIEW_MONTH)
    expect(resolveCalendarView(null, false).view).toBe(CALENDAR_VIEW_MONTH_AGENDA)
  })

  // The store keeps the viewer's pick, never the resolution, so widening restores it — the
  // round trip the criteria name, a resize over the crossing in both directions.
  it('restores a stored week above the crossing after a trip below it', () => {
    const stored = CALENDAR_VIEW_WEEK

    expect(resolveCalendarView(stored, false).option).toBe(CALENDAR_VIEW_MONTH)
    expect(resolveCalendarView(stored, true).option).toBe(CALENDAR_VIEW_WEEK)
  })
})

describe('the week list window', () => {
  const NONE = { start: null, end: null }
  const today = '2026-11-05'

  it('is this week when the URL names no dates, or names exactly those dates', () => {
    expect(calendarWindow(NONE, today)).toEqual({
      start: today,
      end: '2026-11-11',
      isThisWeek: true,
    })
    expect(calendarWindow({ start: today, end: '2026-11-11' }, today).isThisWeek).toBe(true)
    expect(calendarWindow({ start: today, end: '2026-11-08' }, today).isThisWeek).toBe(false)
  })

  it('steps by its own length, and clears the range on landing back on this week', () => {
    const week = calendarWindow(NONE, today)
    const next = shiftCalendarWindow(week, 1, today)

    expect(next).toEqual({ start: '2026-11-12', end: '2026-11-18' })
    expect(shiftCalendarWindow(calendarWindow(next, today), -1, today)).toEqual(NONE)
    expect(
      shiftCalendarWindow(calendarWindow({ start: today, end: today }, today), 1, today),
    ).toEqual({ start: '2026-11-06', end: '2026-11-12' })
  })

  it('pages seven days from a shorter window, such as a link opened mid-week', () => {
    const window = calendarWindow({ start: '2026-11-08', end: '2026-11-10' }, today)

    expect(shiftCalendarWindow(window, 1, today)).toEqual({
      start: '2026-11-11',
      end: '2026-11-17',
    })
  })

  it('counts only the filters a visitor chose', () => {
    const scoped = {
      ...DEFAULT_FILTERS,
      region: 'gb',
      format: 'online' as const,
      dateRange: { start: '2026-11-12', end: '2026-11-18' },
    }

    expect(chosenCalendarFilters(scoped, true)).toEqual({
      ...DEFAULT_FILTERS,
      format: 'online',
    })
    expect(chosenCalendarFilters(scoped, false).dateRange).toEqual(scoped.dateRange)
    expect(chosenCalendarFilters(scoped, false).region).toBeNull()
  })

  it('never steps back past today', () => {
    const window = calendarWindow({ start: '2026-11-07', end: '2026-11-08' }, today)

    expect(shiftCalendarWindow(window, -1, today)).toEqual(NONE)
  })

  it('groups entries inside the window by day, in time order, skipping empty days', () => {
    const entry = (id: string, start: string, name = 'x') => ({
      id,
      name,
      title: name,
      start,
      end: start,
      path: '/x',
      zone: 'Europe/London',
    })
    const days = groupEntriesByDay(
      [
        entry('a', '2026-11-07 18:00'),
        entry('b', '2026-11-05 19:00'),
        entry('c', '2026-11-05 09:00'),
        entry('d', '2026-11-12 09:00'),
      ],
      { start: today, end: '2026-11-11' },
    )

    expect(days.map((day) => day.date)).toEqual(['2026-11-05', '2026-11-07'])
    expect(days[0].entries.map((item) => item.id)).toEqual(['c', 'b'])
  })
})

describe('tidyPlaceCase', () => {
  it('recases a town typed in capitals, keeping its joining words low', () => {
    expect(tidyPlaceCase('HARROGATE')).toBe('Harrogate')
    expect(tidyPlaceCase('STRATFORD-UPON-AVON')).toBe('Stratford-upon-Avon')
    expect(tidyPlaceCase('NEWCASTLE UPON TYNE')).toBe('Newcastle upon Tyne')
  })

  it('leaves any other case as it was given', () => {
    expect(tidyPlaceCase('McLean')).toBe('McLean')
    expect(tidyPlaceCase('London')).toBe('London')
  })
})
