import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'

import {
  DEFAULT_FILTERS,
  activeFilterCount,
  filtersKey,
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
    })

    expect(activeFilterCount(filters)).toBe(5)
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
  })
})
