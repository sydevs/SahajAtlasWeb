import { describe, expect, it } from 'vitest'

import {
  bestRecovery,
  facetCounts,
  hiddenInPerson,
  scopeFacets,
  scopeOffers,
  shownGroups,
} from './facets'
import { DEFAULT_FILTERS, matchesFilters } from './filters'

// Tuesday 2026-11-10 19:00 and Saturday 2026-11-14 10:00, London.
const tuesdayEvening = new Date('2026-11-10T19:00:00Z')
const saturdayMorning = new Date('2026-11-14T10:00:00Z')

const event = (over: {
  eventType?: 'online' | 'offline'
  languages?: string[]
  dates?: Date[]
  recurrenceType?: 'WEEKLY' | 'MONTHLY' | null
}) =>
  ({
    eventType: over.eventType ?? 'offline',
    languages: over.languages ?? ['en'],
    timeZone: 'Europe/London',
    schedule: {
      recurrenceType: over.recurrenceType === undefined ? 'WEEKLY' : over.recurrenceType,
      firstDate_tz: 'Europe/London',
      upcomingDates: over.dates ?? [tuesdayEvening],
    },
  }) as unknown as Parameters<typeof matchesFilters>[0]

const feed = [
  event({ languages: ['en'] }),
  event({ languages: ['en', 'fr'], dates: [saturdayMorning] }),
  event({ eventType: 'online', languages: ['fr'], dates: [tuesdayEvening, saturdayMorning] }),
]
const today = '2026-11-05'

describe('facetCounts', () => {
  it('counts each option with the other groups still applied', () => {
    const counts = facetCounts(feed, { ...DEFAULT_FILTERS, format: 'offline' }, today)

    expect(counts.total).toBe(2)
    expect(counts.days[2]).toBe(1)
    expect(counts.days[6]).toBe(1)
    expect(counts.format).toEqual({ offline: 2, online: 1 })
  })

  it('agrees with the predicate the list and the map use', () => {
    const filters = { ...DEFAULT_FILTERS, daysOfWeek: [2], timeOfDay: ['evening' as const] }
    const counts = facetCounts(feed, filters, today)

    expect(counts.total).toBe(feed.filter((e) => matchesFilters(e, filters, today)).length)
  })

  it('sorts languages by how many classes use them', () => {
    expect(facetCounts(feed, DEFAULT_FILTERS, today).languages.map((l) => l.code)).toEqual([
      'en',
      'fr',
    ])
  })
})

describe('facetRelevance', () => {
  it('drops a group where no option could narrow the results', () => {
    expect(scopeFacets([event({}), event({})], today).relevance).toEqual({
      format: false,
      days: false,
      time: false,
      cadence: false,
    })
  })

  it('keeps a group where an option leaves some classes but not all', () => {
    const { relevance } = scopeFacets(feed, today)

    expect(relevance.format).toBe(true)
    expect(relevance.days).toBe(true)
    expect(relevance.cadence).toBe(false)
  })
})

describe('shownGroups', () => {
  const scope = scopeFacets([event({}), event({})], today)

  it('drops a group that could not narrow this scope, but keeps one in use', () => {
    expect(shownGroups(DEFAULT_FILTERS, scope)).toMatchObject({ format: false, days: false })
    expect(shownGroups({ ...DEFAULT_FILTERS, format: 'online' }, scope).format).toBe(true)
    expect(shownGroups({ ...DEFAULT_FILTERS, cadence: 'WEEKLY' }, scope).cadence).toBe(true)
  })

  it('keeps Language where every class speaks one, so it says which', () => {
    expect(scope.counts.languages).toEqual([{ code: 'en', count: 2 }])
    expect(shownGroups(DEFAULT_FILTERS, scope).languages).toBe(true)
  })

  it('asks every question but Language until the counts arrive', () => {
    expect(shownGroups(DEFAULT_FILTERS, undefined)).toEqual({
      format: true,
      days: true,
      time: true,
      cadence: true,
      languages: false,
    })
  })
})

describe('bestRecovery', () => {
  it('names the answer whose removal brings back the most classes', () => {
    const events = [
      event({ eventType: 'online', languages: ['en'] }),
      event({ eventType: 'online', languages: ['en'] }),
      event({ eventType: 'offline', languages: ['fr'] }),
    ]
    const filters = { ...DEFAULT_FILTERS, format: 'online' as const, languages: ['fr'] }

    expect(bestRecovery(events, filters, today)).toEqual({
      group: 'languages',
      count: 2,
      patch: { languages: [] },
    })
  })

  it('removes a whole question: every day picked goes at once', () => {
    const filters = { ...DEFAULT_FILTERS, daysOfWeek: [1, 7] }

    expect(bestRecovery(feed, filters, today)).toMatchObject({ group: 'days', count: 3 })
  })

  it('is null when removing any one answer still finds nothing', () => {
    const events = [event({ eventType: 'online', languages: ['en'] })]
    const filters = { ...DEFAULT_FILTERS, format: 'offline' as const, languages: ['fr'] }

    expect(bestRecovery(events, filters, today)).toBeNull()
  })

  it('is null with nothing answered', () => {
    expect(bestRecovery(feed, DEFAULT_FILTERS, today)).toBeNull()
  })
})

describe('facetCounts — a listing with no times', () => {
  it('counts in every time of day, and says how many such listings there are', () => {
    const without = facetCounts(feed, DEFAULT_FILTERS, today)
    const counts = facetCounts([...feed, event({ dates: [] })], DEFAULT_FILTERS, today)

    expect(without.timeless).toBe(0)
    expect(counts.timeless).toBe(1)
    for (const period of ['morning', 'afternoon', 'evening', 'night'] as const) {
      expect(counts.time[period]).toBe(without.time[period] + 1)
    }
  })
})

describe('hiddenInPerson', () => {
  it('counts the in-person classes the filters hide, never an online one', () => {
    // Saturday hides the Tuesday class in person; the online one matches, and would not count.
    expect(hiddenInPerson(feed, { ...DEFAULT_FILTERS, daysOfWeek: [6] }, today)).toBe(1)
    // French hides the English-only class, and the online French one is never counted.
    expect(hiddenInPerson(feed, { ...DEFAULT_FILTERS, languages: ['fr'] }, today)).toBe(1)
    // Online only hides both in-person classes.
    expect(hiddenInPerson(feed, { ...DEFAULT_FILTERS, format: 'online' }, today)).toBe(2)
  })

  it('hides nothing with nothing chosen', () => {
    expect(hiddenInPerson(feed, DEFAULT_FILTERS, today)).toBe(0)
  })
})

describe('scopeOffers', () => {
  it('answers as shownGroups does from the counts, without counting', () => {
    const inPersonOnly = feed.filter((event) => event.eventType === 'offline')
    const noLanguage = feed.map((event) => ({ ...event, languages: [] }))

    for (const events of [feed, inPersonOnly, noLanguage]) {
      for (const filters of [DEFAULT_FILTERS, { ...DEFAULT_FILTERS, format: 'online' as const }]) {
        const { format, languages } = shownGroups(filters, scopeFacets(events, today))

        expect(scopeOffers(filters, events)).toEqual({ format, languages })
      }
    }
  })

  it('offers neither while the feed loads, unless already answered', () => {
    expect(scopeOffers(DEFAULT_FILTERS, [])).toEqual({ format: false, languages: false })
    expect(scopeOffers({ ...DEFAULT_FILTERS, format: 'online', languages: ['en'] }, [])).toEqual({
      format: true,
      languages: true,
    })
  })
})
