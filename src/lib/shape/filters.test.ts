import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'

import {
  DEFAULT_FILTERS,
  activeFilterCount,
  filtersFromParams,
  filtersKey,
  filtersToParams,
  hasActiveFilters,
  matchesFilters,
  type EventFilters,
} from './filters'

// Build an event whose occurrences are stated in a given zone, so the expected
// local weekday/hour is exactly what we constructed (no calendar arithmetic).
const at = (zone: string, ...localIso: string[]) => DateTime.fromISO(localIso[0], { zone })

const event = (
  overrides: Partial<{
    eventType: 'offline' | 'online'
    languages: string[]
    zone: string | null
    recurrenceType: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null
    occurrences: DateTime[]
  }> = {},
) => ({
  eventType: overrides.eventType ?? ('offline' as const),
  languages: overrides.languages ?? ['en'],
  schedule: {
    firstDate: new Date('2026-01-01T00:00:00Z'),
    firstDate_tz: overrides.zone === undefined ? 'Asia/Kolkata' : overrides.zone,
    recurrenceType: 'recurrenceType' in overrides ? overrides.recurrenceType : ('WEEKLY' as const),
    upcomingDates: (overrides.occurrences ?? []).map((dt) => dt.toJSDate()),
  },
})

const withFilters = (overrides: Partial<EventFilters>): EventFilters => ({
  ...DEFAULT_FILTERS,
  ...overrides,
})

describe('matchesFilters — defaults', () => {
  it('passes every event when all filters are at their defaults', () => {
    expect(matchesFilters(event({ occurrences: [] }), DEFAULT_FILTERS)).toBe(true)
    expect(matchesFilters(event({ eventType: 'online', languages: [] }), DEFAULT_FILTERS)).toBe(
      true,
    )
  })
})

describe('matchesFilters — format', () => {
  it('matches the selected format only', () => {
    const online = event({ eventType: 'online' })
    const offline = event({ eventType: 'offline' })

    expect(matchesFilters(online, withFilters({ format: 'online' }))).toBe(true)
    expect(matchesFilters(offline, withFilters({ format: 'online' }))).toBe(false)
    expect(matchesFilters(offline, withFilters({ format: 'offline' }))).toBe(true)
  })
})

describe('matchesFilters — language', () => {
  it('matches when the event offers any selected language', () => {
    const hindiEnglish = event({ languages: ['hi', 'en'] })

    expect(matchesFilters(hindiEnglish, withFilters({ languages: ['en'] }))).toBe(true)
    expect(matchesFilters(hindiEnglish, withFilters({ languages: ['fr'] }))).toBe(false)
    expect(matchesFilters(hindiEnglish, withFilters({ languages: ['fr', 'hi'] }))).toBe(true)
  })
})

describe('matchesFilters — cadence', () => {
  it('matches the recurrence, with `once` meaning no recurrence', () => {
    const weekly = event({ recurrenceType: 'WEEKLY' })
    const monthly = event({ recurrenceType: 'MONTHLY' })
    const oneTime = event({ recurrenceType: null })

    expect(matchesFilters(weekly, withFilters({ cadence: 'WEEKLY' }))).toBe(true)
    expect(matchesFilters(weekly, withFilters({ cadence: 'MONTHLY' }))).toBe(false)
    expect(matchesFilters(monthly, withFilters({ cadence: 'MONTHLY' }))).toBe(true)
    expect(matchesFilters(oneTime, withFilters({ cadence: 'once' }))).toBe(true)
    expect(matchesFilters(weekly, withFilters({ cadence: 'once' }))).toBe(false)
  })

  it('does not treat a schedule-less event as one-time', () => {
    const noSchedule = { eventType: 'offline' as const, languages: ['en'], schedule: null }

    expect(matchesFilters(noSchedule, withFilters({ cadence: 'once' }))).toBe(false)
    expect(matchesFilters(noSchedule, DEFAULT_FILTERS)).toBe(true)
  })
})

describe('matchesFilters — day of week (in the event zone)', () => {
  const monday = at('Asia/Kolkata', '2026-07-06T09:30') // a Monday, 09:30 IST
  const kolkataMonday = event({ zone: 'Asia/Kolkata', occurrences: [monday] })

  it('matches when an occurrence falls on a selected weekday', () => {
    expect(matchesFilters(kolkataMonday, withFilters({ daysOfWeek: [monday.weekday] }))).toBe(true)
  })

  it('excludes when no occurrence falls on a selected weekday', () => {
    const otherDay = (monday.weekday % 7) + 1

    expect(matchesFilters(kolkataMonday, withFilters({ daysOfWeek: [otherDay] }))).toBe(false)
  })

  it('uses the event zone, not UTC, to pick the weekday', () => {
    // 18:00 Mon in LA is 01:00 Tue in UTC — the local (event-zone) weekday must win.
    const laMonEvening = at('America/Los_Angeles', '2026-07-06T18:00')
    const laEvent = event({ zone: 'America/Los_Angeles', occurrences: [laMonEvening] })

    expect(matchesFilters(laEvent, withFilters({ daysOfWeek: [laMonEvening.weekday] }))).toBe(true)
    // A UTC reading would place it on the next day; assert that day does NOT match.
    const utcWeekday = DateTime.fromJSDate(laMonEvening.toJSDate(), { zone: 'UTC' }).weekday

    expect(utcWeekday).not.toBe(laMonEvening.weekday)
    expect(matchesFilters(laEvent, withFilters({ daysOfWeek: [utcWeekday] }))).toBe(false)
  })

  it('excludes events with no occurrences while a day filter is active', () => {
    const noOccurrences = event({ occurrences: [] })

    expect(matchesFilters(noOccurrences, withFilters({ daysOfWeek: [1] }))).toBe(false)
    // …but such an event still passes a non-day/time filter.
    expect(matchesFilters(noOccurrences, withFilters({ format: 'offline' }))).toBe(true)
  })
})

describe('matchesFilters — time of day (local start window)', () => {
  const morning = at('Asia/Kolkata', '2026-07-06T09:30')
  const morningEvent = event({ zone: 'Asia/Kolkata', occurrences: [morning] })

  it('matches when the local start hour is within range (inclusive)', () => {
    expect(matchesFilters(morningEvent, withFilters({ timeOfDay: [9, 10] }))).toBe(true)
    expect(matchesFilters(morningEvent, withFilters({ timeOfDay: [9.5, 12] }))).toBe(true)
    expect(matchesFilters(morningEvent, withFilters({ timeOfDay: [10, 12] }))).toBe(false)
  })

  it('falls back to UTC when the event has no timezone', () => {
    const utcNine = at('UTC', '2026-07-06T09:00')
    const noZone = event({ zone: null, occurrences: [utcNine] })

    expect(matchesFilters(noZone, withFilters({ timeOfDay: [8, 10] }))).toBe(true)
    expect(matchesFilters(noZone, withFilters({ timeOfDay: [10, 12] }))).toBe(false)
  })

  it('evaluates online events in the viewer local zone', () => {
    const localZone = DateTime.local().zoneName ?? 'UTC'
    const localNine = at(localZone, '2026-07-06T09:30')
    const onlineEvent = event({ eventType: 'online', zone: null, occurrences: [localNine] })

    expect(matchesFilters(onlineEvent, withFilters({ timeOfDay: [9, 10] }))).toBe(true)
  })
})

describe('matchesFilters — day and time evaluated together', () => {
  const monMorning = at('Asia/Kolkata', '2026-07-06T09:30') // Mon 09:30
  const wedEvening = at('Asia/Kolkata', '2026-07-08T19:00') // Wed 19:00
  const twoOccurrences = event({ zone: 'Asia/Kolkata', occurrences: [monMorning, wedEvening] })

  it('requires one occurrence to satisfy both day and time', () => {
    // Monday + morning: the Monday occurrence satisfies both.
    expect(
      matchesFilters(
        twoOccurrences,
        withFilters({ daysOfWeek: [monMorning.weekday], timeOfDay: [9, 12] }),
      ),
    ).toBe(true)
    // Wednesday + morning: the Wednesday occurrence is in the evening, and the
    // morning occurrence is a Monday — no single occurrence matches.
    expect(
      matchesFilters(
        twoOccurrences,
        withFilters({ daysOfWeek: [wedEvening.weekday], timeOfDay: [9, 12] }),
      ),
    ).toBe(false)
    // Wednesday + evening: the Wednesday occurrence satisfies both.
    expect(
      matchesFilters(
        twoOccurrences,
        withFilters({ daysOfWeek: [wedEvening.weekday], timeOfDay: [18, 21] }),
      ),
    ).toBe(true)
  })
})

describe('matchesFilters — date range (in the event zone)', () => {
  // A fixed "today" so the lower-bound floor is deterministic (occurrences are later).
  const TODAY = '2026-07-14'
  const jul20 = at('Asia/Kolkata', '2026-07-20T09:30') // Mon 20 Jul, 09:30 IST
  const on20th = event({ zone: 'Asia/Kolkata', occurrences: [jul20] })
  const inRange = (start: string | null, end: string | null) =>
    matchesFilters(on20th, withFilters({ dateRange: { start, end } }), TODAY)

  it('matches when an occurrence lands in the window (inclusive)', () => {
    expect(inRange('2026-07-20', '2026-07-27')).toBe(true)
    expect(inRange('2026-07-20', '2026-07-20')).toBe(true)
  })

  it('excludes when the occurrence falls outside the window', () => {
    expect(inRange('2026-07-21', '2026-07-27')).toBe(false)
    expect(inRange(null, '2026-07-19')).toBe(false)
  })

  it('honours an open bound (from-only / until-only)', () => {
    expect(inRange('2026-07-01', null)).toBe(true)
    expect(inRange('2026-07-21', null)).toBe(false)
    expect(inRange(null, '2026-07-31')).toBe(true)
  })

  it('floors an open lower bound at today — no occurrence before today matches', () => {
    const past = at('Asia/Kolkata', '2026-07-10T09:30') // before TODAY
    const evt = event({ zone: 'Asia/Kolkata', occurrences: [past] })
    const untilEnd = (start: string | null, end: string | null) =>
      matchesFilters(evt, withFilters({ dateRange: { start, end } }), TODAY)

    // Open "until Y": the floor (today) excludes the past occurrence…
    expect(untilEnd(null, '2026-07-31')).toBe(false)
    // …but an explicit earlier start opts back into it.
    expect(untilEnd('2026-07-01', '2026-07-31')).toBe(true)
  })

  it('excludes events with no occurrences while a date filter is active', () => {
    const noOccurrences = event({ occurrences: [] })

    expect(
      matchesFilters(noOccurrences, withFilters({ dateRange: { start: '2026-07-20', end: null } })),
    ).toBe(false)
  })

  it('reads the calendar date in the event zone, not UTC', () => {
    // 02:00 on 20 Jul in Kolkata (UTC+5:30) is still 19 Jul in UTC — the event-zone date wins.
    const early = at('Asia/Kolkata', '2026-07-20T02:00')
    const evt = event({ zone: 'Asia/Kolkata', occurrences: [early] })
    const on = (start: string, end: string) =>
      matchesFilters(evt, withFilters({ dateRange: { start, end } }))

    expect(on('2026-07-20', '2026-07-20')).toBe(true)
    expect(on('2026-07-19', '2026-07-19')).toBe(false)
  })

  it('evaluates online events in the viewer zone, and null-tz as UTC', () => {
    const localZone = DateTime.local().zoneName ?? 'UTC'
    const online = event({
      eventType: 'online',
      zone: null,
      occurrences: [at(localZone, '2026-07-20T12:00')],
    })
    const utc = event({ zone: null, occurrences: [at('UTC', '2026-07-20T12:00')] })
    const only20th = { dateRange: { start: '2026-07-20', end: '2026-07-20' } }

    expect(matchesFilters(online, withFilters(only20th))).toBe(true)
    expect(matchesFilters(utc, withFilters(only20th))).toBe(true)
  })

  it('combines with time per occurrence (dates from different occurrences do not merge)', () => {
    const monMorning = at('Asia/Kolkata', '2026-07-20T09:30') // Mon 09:30
    const wedEvening = at('Asia/Kolkata', '2026-07-22T19:00') // Wed 19:00
    const twoOccurrences = event({ zone: 'Asia/Kolkata', occurrences: [monMorning, wedEvening] })
    const matches = (overrides: Partial<EventFilters>) =>
      matchesFilters(twoOccurrences, withFilters(overrides))

    // The 22nd is only in the evening; the morning occurrence is the 20th — no overlap.
    expect(
      matches({ dateRange: { start: '2026-07-22', end: '2026-07-22' }, timeOfDay: [9, 12] }),
    ).toBe(false)
    // The 20th morning occurrence satisfies both.
    expect(
      matches({ dateRange: { start: '2026-07-20', end: '2026-07-20' }, timeOfDay: [9, 12] }),
    ).toBe(true)
  })
})

describe('hasActiveFilters / activeFilterCount', () => {
  it('is zero/false for the defaults', () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false)
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0)
  })

  it('counts each non-default filter group once', () => {
    const filters = withFilters({
      format: 'online',
      cadence: 'WEEKLY',
      daysOfWeek: [1, 2],
      languages: ['en'],
      timeOfDay: [9, 17],
      dateRange: { start: '2026-07-20', end: '2026-07-27' },
    })

    expect(activeFilterCount(filters)).toBe(6)
    expect(hasActiveFilters(filters)).toBe(true)
    expect(hasActiveFilters(withFilters({ languages: ['fr'] }))).toBe(true)
  })
})

describe('filtersKey', () => {
  it('is stable regardless of array order', () => {
    const a = withFilters({ daysOfWeek: [3, 1], languages: ['fr', 'en'] })
    const b = withFilters({ daysOfWeek: [1, 3], languages: ['en', 'fr'] })

    expect(filtersKey(a)).toBe(filtersKey(b))
  })

  it('differs when a filter differs', () => {
    expect(filtersKey(DEFAULT_FILTERS)).not.toBe(filtersKey(withFilters({ format: 'online' })))
    expect(filtersKey(DEFAULT_FILTERS)).not.toBe(
      filtersKey(withFilters({ dateRange: { start: '2026-07-20', end: null } })),
    )
  })
})

describe('URL serialization', () => {
  const active: EventFilters = {
    format: 'online',
    cadence: 'WEEKLY',
    daysOfWeek: [1, 3, 5],
    timeOfDay: [9, 17],
    languages: ['en', 'fr'],
    dateRange: { start: null, end: null },
  }

  it('round-trips an active filter set through the query', () => {
    expect(filtersFromParams(filtersToParams(active))).toEqual(active)
  })

  it('omits default (unrestricted) groups so links stay clean', () => {
    expect(filtersToParams(DEFAULT_FILTERS).toString()).toBe('')
    expect(filtersToParams(withFilters({ format: 'online' })).toString()).toBe('format=online')
  })

  it('preserves non-filter params and clears stale filter params in the base', () => {
    const base = new URLSearchParams('format=online&days=1,2&q=paris&center=2.3,48.8')
    const params = filtersToParams(withFilters({ format: 'offline' }), base)

    expect(params.get('format')).toBe('offline') // rewritten
    expect(params.has('days')).toBe(false) // stale filter param dropped
    expect(params.get('q')).toBe('paris') // non-filter param kept
    expect(params.get('center')).toBe('2.3,48.8')
  })

  it('falls back to defaults for missing or malformed params', () => {
    expect(filtersFromParams(new URLSearchParams())).toEqual(DEFAULT_FILTERS)
    // Unknown format/cadence, out-of-range days, reversed time → each group defaults.
    const junk = new URLSearchParams('format=hybrid&cadence=YEARLY&days=0,8,foo&time=20,4')

    expect(filtersFromParams(junk)).toEqual(DEFAULT_FILTERS)
  })

  it('de-dupes and sorts the day and language lists', () => {
    const filters = filtersFromParams(new URLSearchParams('days=5,1,3,3&langs=fr,en,fr'))

    expect(filters.daysOfWeek).toEqual([1, 3, 5])
    expect(filters.languages).toEqual(['en', 'fr'])
  })
})

describe('date-range URL codec', () => {
  const iso = (dt: DateTime): string => dt.toISODate() ?? ''
  const today = DateTime.now().startOf('day')
  const inStart = iso(today.plus({ days: 10 }))
  const inEnd = iso(today.plus({ days: 20 }))

  it('round-trips a two-sided range within the window', () => {
    const params = filtersToParams(withFilters({ dateRange: { start: inStart, end: inEnd } }))

    expect(params.get('dates')).toBe(`${inStart},${inEnd}`)
    expect(filtersFromParams(params).dateRange).toEqual({ start: inStart, end: inEnd })
  })

  it('round-trips an open bound (from-only / until-only)', () => {
    const fromOnly = filtersToParams(withFilters({ dateRange: { start: inStart, end: null } }))

    expect(fromOnly.get('dates')).toBe(`${inStart},`)
    expect(filtersFromParams(fromOnly).dateRange).toEqual({ start: inStart, end: null })

    const untilOnly = filtersToParams(withFilters({ dateRange: { start: null, end: inEnd } }))

    expect(untilOnly.get('dates')).toBe(`,${inEnd}`)
    expect(filtersFromParams(untilOnly).dateRange).toEqual({ start: null, end: inEnd })
  })

  it('omits the param for an unrestricted range', () => {
    expect(filtersToParams(DEFAULT_FILTERS).has('dates')).toBe(false)
  })

  it('clamps a past start and a too-far end into the window', () => {
    const params = new URLSearchParams(`dates=2020-01-01,${iso(today.plus({ months: 18 }))}`)

    expect(filtersFromParams(params).dateRange).toEqual({
      start: iso(today),
      end: iso(today.plus({ months: 12 })),
    })
  })

  it('drops a reversed range', () => {
    const params = new URLSearchParams(`dates=${inEnd},${inStart}`)

    expect(filtersFromParams(params).dateRange).toEqual({ start: null, end: null })
  })

  it('ignores malformed or non-canonical dates', () => {
    const empty = { start: null, end: null }

    expect(filtersFromParams(new URLSearchParams('dates=foo,bar')).dateRange).toEqual(empty)
    expect(filtersFromParams(new URLSearchParams('dates=2026-13-40,')).dateRange).toEqual(empty)
    expect(filtersFromParams(new URLSearchParams('dates=2026-7-6,')).dateRange).toEqual(empty)
  })
})
