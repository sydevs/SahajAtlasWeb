import type { BBox } from 'geojson'

import { describe, expect, it } from 'vitest'

import { parseBounds, placeSize, splitResults } from './sections'

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
  const liberec = inPerson(3, 15.06, 50.77, 88)
  const jihlava = inPerson(4, 15.59, 49.4, 113)
  const brno = inPerson(5, 16.61, 49.2, 187)
  const lipanska = inPerson(1, 14.45, 50.08, 2)

  it('splits a town search into here, nearby, online and distant', () => {
    const paris = inPerson(6, 2.35, 48.85, 880, 'FR')
    const {
      here,
      nearby,
      online: remote,
      distant,
    } = splitResults([brno, online(9), lipanska, paris, jihlava, liberec], {
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
    const { nearby } = splitResults([brno, liberec], {
      bbox: PRAGUE,
      searchCountry: 'CZ',
      keepOrder: true,
    })

    expect(ids(nearby)).toEqual([5, 3])
  })

  it('holds a class across a border to the shorter limit', () => {
    const close = inPerson(7, 16.37, 48.2, 149, 'AT')
    const far = inPerson(8, 13.04, 47.8, 280, 'AT')
    const { nearby, distant } = splitResults([close, far], { bbox: PRAGUE, searchCountry: 'CZ' })

    expect(ids(nearby)).toEqual([7])
    expect(ids(distant)).toEqual([8])
  })

  it('keeps a class inside the box out of "here" when it is in another country', () => {
    const dresden = inPerson(10, 14.1, 50.0, 25, 'DE')
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
    // In Slovakia, about 80 km from Ostrava.
    const zilina = inPerson(13, 18.9, 49.2, 260, 'SK')
    const { here, nearby, distant } = splitResults([ostrava, zilina], {
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
    const far = inPerson(15, -0.3, 51.7, 30, 'GB')
    const { size, here, nearby } = splitResults([close, far], {
      bbox: [-0.1879, 51.5517, -0.1583, 51.5722],
      searchCountry: 'GB',
    })

    expect(size).toBe('spot')
    expect(ids(here)).toEqual([14])
    expect(ids(nearby)).toEqual([15])
  })
})
