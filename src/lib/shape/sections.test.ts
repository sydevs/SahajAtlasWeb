import type { BBox } from 'geojson'

import { describe, expect, it } from 'vitest'

import { boundsWith, parseBounds, placeSize, searchFrame, splitResults } from './sections'

const PRAGUE: BBox = [14.07, 49.86, 14.77, 50.31]
const CZECHIA: BBox = [12.09, 48.55, 18.86, 51.06]

const inPerson = (
  id: number,
  longitude: number,
  latitude: number,
  distance: number,
  country: string | null = 'CZ',
) => ({
  id,
  distance,
  eventType: 'offline' as const,
  address: { country, longitude, latitude },
})

const online = (id: number) => ({ id, eventType: 'online' as const, address: null })

const ids = (events: { id: number }[]) => events.map((event) => event.id)

describe('placeSize', () => {
  it('reads a street, a city and a country from the size of the box', () => {
    expect(placeSize(undefined)).toBe('spot')
    expect(placeSize([-0.1879, 51.5517, -0.1583, 51.5722])).toBe('spot')
    expect(placeSize(PRAGUE)).toBe('town')
    expect(placeSize(CZECHIA)).toBe('area')
  })
})

describe('parseBounds', () => {
  it('takes four finite numbers and nothing else', () => {
    expect(parseBounds('1,2,3,4')).toEqual([1, 2, 3, 4])
    expect(parseBounds('1,2,3')).toBeUndefined()
    expect(parseBounds('1,2,3,x')).toBeUndefined()
    expect(parseBounds(null)).toBeUndefined()
  })
})

describe('splitResults', () => {
  // A town search measures each class from the searched place (its `distance`), against the 25 km
  // nearby cut. These sit outside the Prague box; their distances are set for the cut.
  const north = inPerson(3, 14.47, 50.35, 8)
  const east = inPerson(4, 14.95, 50.1, 15)
  const south = inPerson(5, 14.4, 49.8, 22)
  const lipanska = inPerson(1, 14.45, 50.08, 2)

  it('splits a town search into here, nearby, online and distant', () => {
    const paris = inPerson(6, 2.35, 48.85, 880, 'FR')
    const {
      here,
      nearby,
      online: remote,
      distant,
    } = splitResults([south, online(9), lipanska, paris, east, north], {
      bbox: PRAGUE,
      searchCountry: 'CZ',
    })

    expect(ids(here)).toEqual([1])
    expect(ids(remote)).toEqual([9])
    expect(ids(distant)).toEqual([6])
    // Nearest first, whatever order the score left them in.
    expect(ids(nearby)).toEqual([3, 4, 5])
  })

  it('keeps the incoming order when the visitor asked for Soonest', () => {
    const { nearby } = splitResults([south, north], {
      bbox: PRAGUE,
      searchCountry: 'CZ',
      keepOrder: true,
    })

    expect(ids(nearby)).toEqual([5, 3])
  })

  it('holds a class across a border to the shorter limit', () => {
    // Across the border the cut is half (12.5 km): 12 km is near, 20 km is not.
    const close = inPerson(7, 14.85, 49.75, 12, 'AT')
    const far = inPerson(8, 14.9, 49.7, 20, 'AT')
    const { nearby, distant } = splitResults([close, far], { bbox: PRAGUE, searchCountry: 'CZ' })

    expect(ids(nearby)).toEqual([7])
    expect(ids(distant)).toEqual([8])
  })

  it('keeps a class inside the box out of "here" when it is in another country', () => {
    const dresden = inPerson(10, 14.1, 50.0, 10, 'DE')
    const { here, nearby } = splitResults([dresden], { bbox: PRAGUE, searchCountry: 'CZ' })

    expect(here).toEqual([])
    expect(ids(nearby)).toEqual([10])
  })

  it('never calls a class foreign over a country it cannot read', () => {
    const misfiled = inPerson(11, 14.5, 50.1, 5, 'Tschechien')
    const { here } = splitResults([misfiled], { bbox: PRAGUE, searchCountry: 'CZ' })

    expect(ids(here)).toEqual([11])
  })

  it('measures a whole country from its own classes, not its middle', () => {
    // Inside the box and 300+ km from the middle, which the old cut would have called distant.
    const ostrava = inPerson(12, 18.26, 49.82, 210)
    // Just over the border in Poland, about 8 km from Ostrava: inside the half cut for a neighbour.
    const acrossBorder = inPerson(13, 18.36, 49.86, 260, 'PL')
    const { here, nearby, distant } = splitResults([ostrava, acrossBorder], {
      bbox: CZECHIA,
      searchCountry: 'CZ',
    })

    expect(ids(here)).toEqual([12])
    expect(ids(nearby)).toEqual([13])
    expect(distant).toEqual([])
  })

  it('does not count a neighbour as near just because the country box holds it', () => {
    const plzen = inPerson(16, 13.38, 49.74, 140)
    // Inside this rectangle, and far from the one class that is really in the country.
    const kosice = inPerson(17, 18.8, 48.8, 330, 'SK')
    const { nearby, distant } = splitResults([plzen, kosice], {
      bbox: CZECHIA,
      searchCountry: 'CZ',
    })

    expect(nearby).toEqual([])
    expect(ids(distant)).toEqual([17])
  })

  it('treats a street search as a short radius', () => {
    const close = inPerson(14, -0.15, 51.55, 6, 'GB')
    const far = inPerson(15, -0.3, 51.7, 18, 'GB')
    const { size, here, nearby } = splitResults([close, far], {
      bbox: [-0.1879, 51.5517, -0.1583, 51.5722],
      searchCountry: 'GB',
    })

    expect(size).toBe('spot')
    expect(ids(here)).toEqual([14])
    expect(ids(nearby)).toEqual([15])
  })
})

describe('boundsWith', () => {
  const berlin = inPerson(20, 13.4, 52.52, 146, 'DE')
  const liberec = inPerson(21, 15.06, 50.77, 198)
  const frankfurt = inPerson(22, 8.68, 50.11, 292, 'DE')
  const leipzig: BBox = [12.24, 51.24, 12.54, 51.45]

  it('holds the place and its nearest classes, so a pin is in view', () => {
    expect(boundsWith(leipzig, [12.37, 51.34], [berlin], 1)).toEqual([12.24, 51.24, 13.4, 52.52])
  })

  it('stops at the count, leaving out what is farther', () => {
    const box = boundsWith(leipzig, [12.37, 51.34], [berlin, liberec, frankfurt], 2)

    expect(box?.[0]).toBe(12.24)
    expect(box?.[2]).toBe(15.06)
  })

  it('falls back on the searched point with no box', () => {
    expect(boundsWith(undefined, [12.37, 51.34], [berlin], 1)).toEqual([12.37, 51.34, 13.4, 52.52])
  })
})

describe('searchFrame', () => {
  const center: [number, number] = [14.42, 50.09]
  const lipanska = inPerson(1, 14.45, 50.08, 2)
  // Outside the Prague box and past the 25 km nearby cut, but within reach.
  const liberec = inPerson(3, 15.06, 50.77, 88)
  const brno = inPerson(5, 16.61, 49.2, 187)

  it('frames just the place when it has classes of its own', () => {
    const sections = splitResults([lipanska, liberec], { bbox: PRAGUE, searchCountry: 'CZ' })

    expect(searchFrame(sections, PRAGUE, center)).toEqual(PRAGUE)
  })

  it('reaches past the nearby cut to the nearest class when the place has none', () => {
    const sections = splitResults([liberec, brno], { bbox: PRAGUE, searchCountry: 'CZ' })
    const frame = searchFrame(sections, PRAGUE, center)

    expect(frame?.[3]).toBeCloseTo(50.77)
    // Brno is past the reach, so it doesn't drag the frame south.
    expect(frame?.[1]).toBe(PRAGUE[1])
  })

  it('stays on the place when nothing is within reach', () => {
    const sections = splitResults([brno], { bbox: PRAGUE, searchCountry: 'CZ' })

    expect(searchFrame(sections, PRAGUE, center)).toEqual(PRAGUE)
  })
})
