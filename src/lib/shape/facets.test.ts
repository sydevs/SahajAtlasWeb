import { describe, expect, it } from 'vitest'

import { bestRecovery, facetCounts, scopeRelevance } from './facets'
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

describe('scopeRelevance', () => {
  it('drops a group where no option could narrow the results', () => {
    const relevance = scopeRelevance([event({}), event({})], today)

    expect(relevance).toEqual({
      format: false,
      days: false,
      time: false,
      cadence: false,
      languages: false,
    })
  })

  it('keeps a group where an option leaves some classes but not all', () => {
    const relevance = scopeRelevance(feed, today)

    expect(relevance.format).toBe(true)
    expect(relevance.languages).toBe(true)
    expect(relevance.cadence).toBe(false)
  })
})

describe('bestRecovery', () => {
  it('names the answered group that brings back the most classes', () => {
    const events = [
      event({ eventType: 'online', languages: ['en'] }),
      event({ eventType: 'online', languages: ['en'] }),
      event({ eventType: 'offline', languages: ['fr'] }),
    ]
    const recovery = bestRecovery(events, {
      ...DEFAULT_FILTERS,
      format: 'online',
      languages: ['fr'],
    })

    expect(recovery?.group).toBe('languages')
    expect(recovery?.count).toBe(2)
  })

  it('is null when nothing has been answered', () => {
    expect(bestRecovery([event({})], DEFAULT_FILTERS)).toBeNull()
  })
})
