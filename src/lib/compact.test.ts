import type { GeoFeature, Geojson } from '@/types'

import { describe, expect, it } from 'vitest'

import { COMPACT_ROWS, compactRows } from './compact'

import { mockEventSlim } from '@/mocks/events'

// The three rows a compact card shows, picked out of the already-cached feed (issue #161).

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000)

const feature = (
  id: number,
  opts: { days?: number; coordinates?: [number, number] } = {},
): GeoFeature => ({
  type: 'Feature',
  id,
  geometry: opts.coordinates ? { type: 'Point', coordinates: opts.coordinates } : null,
  properties: {
    id,
    eventType: opts.coordinates ? 'offline' : 'online',
    languages: ['en'],
    region: mockEventSlim.region,
    webPath: `/gb/london/${id}`,
    schedule:
      opts.days === undefined
        ? null
        : { ...mockEventSlim.schedule!, upcomingDates: [inDays(opts.days)] },
  },
})

const ids = (features: GeoFeature[]) => features.map((f) => f.properties.id)

const feed = (features: GeoFeature[]): Geojson => ({ type: 'FeatureCollection', features })

describe('compactRows — with no idea where the viewer is', () => {
  it('shows the soonest classes first', () => {
    const geojson = feed([
      feature(1, { days: 9 }),
      feature(2, { days: 1 }),
      feature(3, { days: 4 }),
    ])

    expect(ids(compactRows(geojson, undefined))).toEqual([2, 3, 1])
  })

  it('stops at the row budget', () => {
    const geojson = feed([1, 2, 3, 4, 5, 6].map((id) => feature(id, { days: id })))

    expect(compactRows(geojson, undefined)).toHaveLength(COMPACT_ROWS)
    expect(compactRows(geojson, undefined, 2)).toHaveLength(2)
  })

  // A dormant class is a row that cannot be attended, and there are only three rows.
  it('drops classes with no next occurrence rather than sorting them last', () => {
    const geojson = feed([feature(1), feature(2, { days: 3 })])

    expect(ids(compactRows(geojson, undefined))).toEqual([2])
  })

  // The feed comes out of the React Query cache and is shared with the map and every list.
  // BOTH branches, because the located one is the one that sorts a derived array and so is
  // the easier of the two in which to reintroduce an in-place sort.
  it.each([undefined, [0, 51.5] as [number, number]])(
    'never reorders the cached feed in place (from: %p)',
    (from) => {
      const features = [
        feature(1, { days: 9, coordinates: [5, 51.5] }),
        feature(2, { days: 1, coordinates: [1, 51.5] }),
      ]

      compactRows(feed(features), from)

      expect(ids(features)).toEqual([1, 2])
    },
  )

  it('copes with a feed that has not arrived', () => {
    expect(compactRows(undefined, undefined)).toEqual([])
  })
})

describe('compactRows — with a location', () => {
  // Greenwich; the two located features sit at increasing longitudes east of it.
  const here: [number, number] = [0, 51.5]

  it('shows the nearest classes first', () => {
    const geojson = feed([
      feature(1, { days: 1, coordinates: [5, 51.5] }),
      feature(2, { days: 9, coordinates: [1, 51.5] }),
      feature(3, { days: 4, coordinates: [3, 51.5] }),
    ])

    expect(ids(compactRows(geojson, here))).toEqual([2, 3, 1])
  })

  // An online class is attendable from anywhere, so it belongs in the list — just last,
  // behind everything with a real place.
  it('keeps placeless online classes, behind the located ones', () => {
    const geojson = feed([feature(1, { days: 1 }), feature(2, { days: 9, coordinates: [1, 51.5] })])

    expect(ids(compactRows(geojson, here))).toEqual([2, 1])
  })
})
