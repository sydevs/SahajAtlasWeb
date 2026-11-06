import type { GeoFeature } from '@/types'

import { describe, expect, it } from 'vitest'

import { bestRecovery, facetCounts, facetScope, scopeRelevance } from './facets'
import { DEFAULT_FILTERS, matchesFilters } from './filters'
import { splitResults } from './sections'

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

describe('facetScope', () => {
  // London searched: two classes in town, one at 22 km, Watford inside the box but 26 km out, a
  // class 60 km away in Reading, and one online.
  const LONDON_CENTER: [number, number] = [-0.1276, 51.5072]
  const LONDON_BOX: [number, number, number, number] = [-0.51, 51.28, 0.33, 51.69]
  const feature = (
    id: number,
    coordinates: [number, number] | null,
    over: Parameters<typeof event>[0] = {},
  ): GeoFeature =>
    ({
      type: 'Feature',
      geometry: coordinates && { type: 'Point', coordinates },
      properties: {
        ...event(over),
        id,
        address: coordinates && {
          country: 'GB',
          longitude: coordinates[0],
          latitude: coordinates[1],
        },
      },
    }) as unknown as GeoFeature
  const london = [
    feature(712, [-0.13, 51.51]),
    feature(1142, [-0.15, 51.51], { dates: [saturdayMorning] }),
    feature(806, [0.19, 51.47]),
    feature(824, [-0.4, 51.66]),
    feature(1171, [-0.98, 51.46]),
    feature(9, null, { eventType: 'online' }),
  ]
  const place = { bbox: LONDON_BOX, searchCountry: 'GB' }

  it('counts exactly what the list shows in full: in town, just outside, and online', () => {
    const { events, shownOf } = facetScope(london, { center: LONDON_CENTER, place })
    const counts = facetCounts(events, DEFAULT_FILTERS, today, shownOf)
    const { here, justOutside, online } = splitResults(events, place)

    expect(counts.total).toBe(here.length + justOutside.length + online.length)
    // Watford and Reading wait in "Classes in other cities", so the panel doesn't count them.
    expect(counts.format).toEqual({ offline: 3, online: 1 })
  })

  it('leaves out the class a "see alternatives" search excludes, as the list does', () => {
    // Stirling: the one class near the town is the class being replaced.
    const stirling = [
      feature(830, [-3.94, 56.12], { dates: [] }),
      feature(9, null, { eventType: 'online' }),
    ]
    const { events, shownOf } = facetScope(stirling, {
      center: [-3.937, 56.119],
      place: {},
      excluded: 830,
    })

    expect(facetCounts(events, DEFAULT_FILTERS, today, shownOf).format).toEqual({
      offline: 0,
      online: 1,
    })
  })

  it('counts the whole feed, less the excluded class, with no searched point', () => {
    const { events, shownOf } = facetScope(london, { place: {}, excluded: 712 })

    expect(shownOf).toBeUndefined()
    expect(facetCounts(events, DEFAULT_FILTERS, today).total).toBe(5)
  })
})
