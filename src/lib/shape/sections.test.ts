import type { BBox } from 'geojson'
import type { PlaceScope } from './sections'

import { describe, expect, it } from 'vitest'

import {
  boundsWith,
  localResults,
  localResultsOf,
  nearPlace,
  parseBounds,
  placeRadiusKm,
  placeSize,
  searchFrame,
  splitResults,
} from './sections'

import { approxBounds } from '@/lib/geo'

// The boxes the geocoder answers with. Prague's narrower side is about 26 km across.
const PRAGUE: BBox = [14.2244, 49.9419, 14.7068, 50.1774]
const LONDON: BBox = [-0.51, 51.28, 0.33, 51.69]
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

describe('placeRadiusKm', () => {
  it('is half the narrower side of a town, and never past the 25 km nearby cut', () => {
    expect(placeRadiusKm(PRAGUE)).toBeCloseTo(13.1, 1)
    expect(placeRadiusKm(LONDON)).toBeCloseTo(22.8, 1)
    expect(placeRadiusKm(approxBounds([14.42, 50.08], 60))).toBe(25)
  })

  it('keeps the short radius for a street or no box at all', () => {
    expect(placeRadiusKm(undefined)).toBe(15)
    expect(placeRadiusKm([-0.1879, 51.5517, -0.1583, 51.5722])).toBe(15)
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
  // A town search measures each class from the searched place (its `distance`): within the town's
  // radius it is in the town, then just outside up to the 25 km nearby cut, then other cities up
  // to 100 km. The distances are what decide; the coordinates only have to be plausible.
  const north = inPerson(3, 14.47, 50.15, 8)
  const east = inPerson(4, 14.63, 50.1, 15)
  const south = inPerson(5, 14.4, 49.88, 22)
  const lipanska = inPerson(1, 14.45, 50.08, 2)

  it('splits a town search into here, just outside, other cities, online and distant', () => {
    const paris = inPerson(6, 2.35, 48.85, 880, 'FR')
    const liberec = inPerson(18, 15.06, 50.77, 88)
    const {
      here,
      justOutside,
      nearby,
      online: remote,
      distant,
    } = splitResults([south, online(9), liberec, lipanska, paris, east, north], {
      bbox: PRAGUE,
      searchCountry: 'CZ',
    })

    expect(ids(here)).toEqual([1, 3])
    expect(ids(remote)).toEqual([9])
    expect(ids(distant)).toEqual([6])
    // Nearest first, whatever order the score left them in. East sits inside Prague's box, past
    // its radius: the box frames the camera, it doesn't decide who is in the town.
    expect(ids(justOutside)).toEqual([4, 5])
    // Anton, 6 Nov: Liberec, 90 km away, is another city, not hidden with the rest of the world.
    expect(ids(nearby)).toEqual([18])
  })

  it('keeps Watford out of "In London" although London\'s box holds it', () => {
    const sladeGreen = inPerson(806, 0.19, 51.47, 22.4, 'GB')
    // 150 Church Rd, Watford: inside the box's north-west corner, 26 km from the centre.
    const watford = inPerson(824, -0.4, 51.66, 26.3, 'GB')
    const { here, justOutside, nearby } = splitResults([sladeGreen, watford], {
      bbox: LONDON,
      searchCountry: 'GB',
    })

    expect(ids(here)).toEqual([806])
    expect(justOutside).toEqual([])
    expect(ids(nearby)).toEqual([824])
  })

  it('makes "Near you" the 25 km circle, never the corners of the box around the visitor', () => {
    const at: [number, number] = [14.42, 50.08]
    const edge = inPerson(30, 14.75, 50.08, 24)
    // In the box's corner, 35 km out: past the radius the filter counts name.
    const corner = inPerson(31, 14.76, 50.3, 35)
    // Near you is distance alone, so a class over a border close by is still near.
    const overBorder = inPerson(32, 14.5, 50.0, 20, 'DE')
    const { here, justOutside, nearby } = splitResults([edge, corner, overBorder], {
      bbox: approxBounds(at, 25),
      searchCountry: 'CZ',
      nearVisitor: true,
    })

    expect(ids(here)).toEqual([30, 32])
    expect(justOutside).toEqual([])
    expect(ids(nearby)).toEqual([31])
  })

  it('keeps the incoming order when the visitor asked for Soonest', () => {
    const { justOutside } = splitResults([south, east], {
      bbox: PRAGUE,
      searchCountry: 'CZ',
      keepOrder: true,
    })

    expect(ids(justOutside)).toEqual([5, 4])
  })

  it('holds a class across a border to the shorter limits', () => {
    // Across the border both cuts are half: 12.5 km just outside, 50 km for other cities. A class
    // over the border is never in the town, even inside its radius.
    const close = inPerson(7, 14.85, 49.75, 12, 'AT')
    const mid = inPerson(8, 14.9, 49.7, 20, 'AT')
    const far = inPerson(19, 15.0, 49.6, 60, 'AT')
    const { justOutside, nearby, distant } = splitResults([close, mid, far], {
      bbox: PRAGUE,
      searchCountry: 'CZ',
    })

    expect(ids(justOutside)).toEqual([7])
    expect(ids(nearby)).toEqual([8])
    expect(ids(distant)).toEqual([19])
  })

  it('keeps a class inside the box out of "here" when it is in another country', () => {
    const dresden = inPerson(10, 14.1, 50.0, 10, 'DE')
    const { here, justOutside } = splitResults([dresden], { bbox: PRAGUE, searchCountry: 'CZ' })

    expect(here).toEqual([])
    expect(ids(justOutside)).toEqual([10])
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
    const { here, justOutside, distant } = splitResults([ostrava, acrossBorder], {
      bbox: CZECHIA,
      searchCountry: 'CZ',
    })

    expect(ids(here)).toEqual([12])
    expect(ids(justOutside)).toEqual([13])
    expect(distant).toEqual([])
  })

  it('does not count a neighbour as near just because the country box holds it', () => {
    const plzen = inPerson(16, 13.38, 49.74, 140)
    // Inside this rectangle, and far from the one class that is really in the country.
    const kosice = inPerson(17, 18.8, 48.8, 330, 'SK')
    const { justOutside, nearby, distant } = splitResults([plzen, kosice], {
      bbox: CZECHIA,
      searchCountry: 'CZ',
    })

    expect(justOutside).toEqual([])
    expect(nearby).toEqual([])
    expect(ids(distant)).toEqual([17])
  })

  it('treats a street search as a short radius', () => {
    const close = inPerson(14, -0.15, 51.55, 6, 'GB')
    const far = inPerson(15, -0.3, 51.7, 18, 'GB')
    const { size, here, justOutside } = splitResults([close, far], {
      bbox: [-0.1879, 51.5517, -0.1583, 51.5722],
      searchCountry: 'GB',
    })

    expect(size).toBe('spot')
    expect(ids(here)).toEqual([14])
    expect(ids(justOutside)).toEqual([15])
  })
})

describe('localResults', () => {
  it('holds what the list counts in full: the place, just outside it, and online', () => {
    const events = [
      inPerson(1, 14.45, 50.08, 2),
      inPerson(2, 14.63, 50.1, 15),
      inPerson(3, 15.06, 50.77, 88),
      inPerson(4, 2.35, 48.85, 880, 'FR'),
      online(5),
    ]
    const scope = { bbox: PRAGUE, searchCountry: 'CZ' }
    const { here, justOutside, online: remote } = splitResults(events, scope)

    expect(ids(localResults(events, scope))).toEqual(ids([...here, ...justOutside, ...remote]))
    expect(ids(localResults(events, scope))).toEqual([1, 2, 5])
  })
})

describe('localResultsOf', () => {
  // Every subset of a small set, so no combination of passing classes goes unchecked.
  const subsets = <T>(items: T[]): T[][] =>
    Array.from({ length: 2 ** items.length }, (_, mask) =>
      items.filter((_, bit) => mask & (1 << bit)),
    )
  const sorted = (events: { id: number }[]) => ids(events).sort((a, b) => a - b)

  type Listed = {
    id: number
    distance?: number
    eventType: 'offline' | 'online'
    address: { country: string | null; longitude: number; latitude: number } | null
  }

  const agrees = (events: Listed[], scope: PlaceScope) => {
    const shownOf = localResultsOf(events, scope)

    for (const subset of subsets(events)) {
      expect(sorted(shownOf(subset)), `subset ${ids(subset)}`).toEqual(
        sorted(localResults(subset, scope)),
      )
    }
  }

  it('answers what localResults does for every subset of an area search', () => {
    // Czechia: two of its own classes in the east, one over the Polish border near Ostrava, one
    // Slovak class inside the box but far from any Czech class, a Czech class just past the box,
    // one with no coordinates, and one online. Which of the outside ones count turns on which
    // Czech classes pass.
    agrees(
      [
        inPerson(12, 18.26, 49.82, 210),
        inPerson(18, 17.25, 49.59, 190),
        inPerson(13, 18.36, 49.86, 260, 'PL'),
        inPerson(17, 18.8, 48.8, 330, 'SK'),
        inPerson(19, 12.0, 50.3, 120),
        { id: 20, distance: 20, eventType: 'offline' as const, address: null },
        online(5),
      ],
      { bbox: CZECHIA, searchCountry: 'CZ' },
    )
  })

  it('answers what localResults does for a town, a street and Near me', () => {
    const events = [
      inPerson(1, 14.45, 50.08, 2),
      inPerson(2, 14.63, 50.1, 15),
      inPerson(3, 15.06, 50.77, 88),
      inPerson(4, 14.4, 49.88, 22, 'DE'),
      online(5),
    ]

    agrees(events, { bbox: PRAGUE, searchCountry: 'CZ' })
    agrees(events, { bbox: [14.44, 50.07, 14.46, 50.09], searchCountry: 'CZ' })
    agrees(events, { bbox: CZECHIA, searchCountry: 'CZ', nearVisitor: true })
  })

  it('measures afresh for a class it was not built with', () => {
    const scope = { bbox: PRAGUE, searchCountry: 'CZ' }
    const stranger = inPerson(9, 14.46, 50.08, 1)
    const remote = online(6)

    expect(ids(localResultsOf<Listed>([online(5)], scope)([stranger, remote]))).toEqual([9, 6])
  })
})

describe('nearPlace', () => {
  it('keeps online classes and those within the nearby cut of a town', () => {
    const events = [inPerson(1, 14.45, 50.08, 2), inPerson(2, 15.06, 50.77, 88), online(3)]

    expect(ids(nearPlace(events, { bbox: PRAGUE }))).toEqual([1, 3])
  })

  it('keeps everything in an area and near its edge, whatever the distance to its middle', () => {
    const ostrava = inPerson(12, 18.26, 49.82, 210)
    const acrossBorder = inPerson(13, 18.36, 49.86, 260, 'PL')
    const paris = inPerson(6, 2.35, 48.85, 880, 'FR')

    expect(ids(nearPlace([ostrava, acrossBorder, paris], { bbox: CZECHIA }))).toEqual([12, 13])
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
  // Outside the Prague box and past the 25 km nearby cut: another city, within reach.
  const liberec = inPerson(3, 15.06, 50.77, 88)
  // Just outside the box, inside the nearby cut.
  const beroun = inPerson(4, 13.98, 49.96, 24)
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

  it('frames the classes just outside before the other cities', () => {
    const sections = splitResults([liberec, beroun], { bbox: PRAGUE, searchCountry: 'CZ' })
    const frame = searchFrame(sections, PRAGUE, center)

    expect(sections.here).toEqual([])
    expect(frame?.[0]).toBe(13.98)
    // Liberec waits in its own group, so it doesn't drag the frame north.
    expect(frame?.[3]).toBe(PRAGUE[3])
  })

  it('stays on the place when nothing is within reach', () => {
    const sections = splitResults([brno], { bbox: PRAGUE, searchCountry: 'CZ' })

    expect(searchFrame(sections, PRAGUE, center)).toEqual(PRAGUE)
  })
})
