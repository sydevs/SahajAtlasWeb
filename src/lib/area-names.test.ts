import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  MAX_AREA_LOOKUPS,
  areaKey,
  areaLabel,
  areaLookupPoints,
  cachedAreaNames,
  lookupAreaNames,
} from './area-names'

// Mapbox names the same spot in the language it is asked in.
const reverse = vi.hoisted(() =>
  vi.fn(async (_point: unknown, options: { language?: string }) => ({
    features: [
      {
        properties: {
          context: { place: { name: options.language === 'cs' ? 'Praha' : 'Prague' } },
        },
      },
    ],
  })),
)

vi.mock('@mapbox/search-js-core', () => ({
  GeocodingCore: class {
    reverse = reverse
  },
}))

afterEach(() => {
  vi.unstubAllEnvs()
  reverse.mockClear()
})

describe('areaLabel', () => {
  it('names the part of town when the town is the page itself', () => {
    expect(areaLabel({ place: 'London', neighborhood: 'Balham' }, 'London')).toBe('Balham')
    expect(areaLabel({ place: 'Paris', locality: '15th arrondissement' }, 'Paris')).toBe(
      '15th arrondissement',
    )
  })

  it('names the town when it differs from the page', () => {
    expect(areaLabel({ place: 'Croydon' }, 'London')).toBe('Croydon')
    expect(areaLabel({ place: 'Edgware', neighborhood: 'Queensbury' }, 'London')).toBe('Edgware')
    expect(areaLabel({ place: 'London', neighborhood: 'Balham' }, 'United Kingdom')).toBe('London')
  })

  it('falls back to the locality, then leaves today’s label', () => {
    expect(areaLabel({ place: 'New York', locality: 'Manhattan' }, 'New York')).toBe('Manhattan')
    expect(areaLabel({ place: 'London' }, 'london')).toBeUndefined()
    expect(areaLabel(null, 'London')).toBeUndefined()
  })
})

describe('areaKey', () => {
  it('rounds to about ten metres, so one venue is one lookup', () => {
    expect(areaKey([-0.15231, 51.44321])).toBe(areaKey([-0.15234, 51.44324]))
  })
})

describe('areaLookupPoints', () => {
  const balham: [number, number] = [-0.1523, 51.4432]
  const croydon: [number, number] = [-0.0982, 51.3762]

  it('asks only about rows labelled with the page’s own place, once per spot', () => {
    const entries = [
      { point: balham, place: 'London' },
      { point: balham, place: 'London' },
      { point: croydon, place: 'Croydon' },
      { point: null, place: 'London' },
      { place: 'London' },
    ]

    expect(areaLookupPoints(entries, 'london')).toEqual([balham])
  })

  it('asks nothing on a calendar with no place heading', () => {
    expect(areaLookupPoints([{ point: balham, place: 'London' }], undefined)).toEqual([])
  })

  it('stops at the cap, however many venues the page has', () => {
    const entries = Array.from({ length: 200 }, (_, i) => ({
      point: [i / 100, 51] as [number, number],
      place: 'London',
    }))

    expect(areaLookupPoints(entries, 'London')).toHaveLength(MAX_AREA_LOOKUPS)
  })
})

describe('lookupAreaNames', () => {
  it('keeps each language’s names apart, so a switch never reuses the last one’s', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESSTOKEN', 'pk.test')
    const spot: [number, number] = [14.4378, 50.0755]

    expect(await lookupAreaNames(spot, 'en')).toEqual(expect.objectContaining({ place: 'Prague' }))
    expect(cachedAreaNames(spot, 'cs')).toBeUndefined()
    expect(await lookupAreaNames(spot, 'cs')).toEqual(expect.objectContaining({ place: 'Praha' }))
    expect(cachedAreaNames(spot, 'en')?.place).toBe('Prague')
    expect(reverse).toHaveBeenCalledTimes(2)

    // Known now in both languages: no third request.
    await lookupAreaNames(spot, 'en')
    expect(reverse).toHaveBeenCalledTimes(2)
  })

  it('asks nothing without a Mapbox token', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESSTOKEN', '')

    expect(await lookupAreaNames([2.35, 48.85], 'fr')).toBeNull()
    expect(reverse).not.toHaveBeenCalled()
  })
})
