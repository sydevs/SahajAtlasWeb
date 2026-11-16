import { describe, it, expect } from 'vitest'

import { boundsOfPoints, centerOfBounds, distanceKm, pointCoordinates } from './geo'

describe('boundsOfPoints', () => {
  it('returns null for an empty set', () => {
    expect(boundsOfPoints([])).toBeNull()
  })

  it('returns [west, south, east, north] spanning the points', () => {
    const bounds = boundsOfPoints([
      [4, 51],
      [5, 53],
      [3, 52],
    ])

    expect(bounds).toEqual([3, 51, 5, 53])
  })

  it('collapses a single point to a zero-area box', () => {
    expect(boundsOfPoints([[4.35, 50.85]])).toEqual([4.35, 50.85, 4.35, 50.85])
  })
})

describe('centerOfBounds', () => {
  it('returns the midpoint of the box', () => {
    expect(centerOfBounds([3, 51, 5, 53])).toEqual([4, 52])
  })
})

describe('distanceKm', () => {
  it('measures ~111 km per degree of latitude', () => {
    expect(distanceKm([0, 0], [0, 1])).toBeCloseTo(111.19, 1)
  })

  it('is zero for identical points', () => {
    expect(distanceKm([4.35, 50.85], [4.35, 50.85])).toBe(0)
  })
})

describe('pointCoordinates', () => {
  it('reads a Point', () => {
    expect(pointCoordinates({ type: 'Point', coordinates: [1, 2] } as never)).toEqual([1, 2])
  })

  it('refuses any other geometry, and none', () => {
    expect(pointCoordinates({ type: 'LineString' })).toBeUndefined()
    expect(pointCoordinates(undefined)).toBeUndefined()
  })
})
