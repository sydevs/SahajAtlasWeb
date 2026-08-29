import type { GeoFeature, Geojson } from '@/types'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  GEOLOCATION_DISMISS_KEY,
  hasActivePlaceSearch,
  hasClassWithin,
  isLocalRegion,
  markGeolocationDismissed,
  nearbyBounds,
  readGeolocationDismissed,
  shouldShowGeolocationPrompt,
} from './geolocation'

// Paris as the resolved guess. Coordinates elsewhere are [lng, lat]; NEAR is ~5 km
// east of Paris (well within 100 km), FAR is ~500 km south (well beyond).
const PARIS = { latitude: 48.8566, longitude: 2.3522 }
const PARIS_POINT: [number, number] = [2.3522, 48.8566]
const NEAR: [number, number] = [2.42, 48.86]
const FAR: [number, number] = [2.35, 44.35]

// Only `geometry` is read by the visibility logic, so the properties are a stub.
const located = (coordinates: [number, number]): GeoFeature => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates },
  properties: {} as GeoFeature['properties'],
})
const online = (): GeoFeature => ({
  type: 'Feature',
  geometry: null,
  properties: {} as GeoFeature['properties'],
})
const feed = (...features: GeoFeature[]): Geojson => ({ type: 'FeatureCollection', features })

describe('hasActivePlaceSearch', () => {
  const params = (qs: string) => new URLSearchParams(qs)

  it('is false with no params', () => expect(hasActivePlaceSearch(params(''))).toBe(false))
  it('is true with a ?center', () => expect(hasActivePlaceSearch(params('center=2,48'))).toBe(true))
  it('is true with a ?q', () => expect(hasActivePlaceSearch(params('q=Paris'))).toBe(true))
  it('ignores non-place params (filters, the sort)', () => {
    expect(hasActivePlaceSearch(params('format=online&sort=soonest'))).toBe(false)
  })
})

describe('hasClassWithin', () => {
  it('is false while the feed is still loading (undefined)', () => {
    expect(hasClassWithin(undefined, PARIS_POINT, 100)).toBe(false)
  })
  it('is false for an empty feed', () => {
    expect(hasClassWithin(feed(), PARIS_POINT, 100)).toBe(false)
  })
  it('is true when a located class is within the radius', () => {
    expect(hasClassWithin(feed(located(NEAR)), PARIS_POINT, 100)).toBe(true)
  })
  it('is false when the only located class is beyond the radius', () => {
    expect(hasClassWithin(feed(located(FAR)), PARIS_POINT, 100)).toBe(false)
  })
  it('respects the radius argument (the far class is within a wider one)', () => {
    expect(hasClassWithin(feed(located(FAR)), PARIS_POINT, 600)).toBe(true)
  })
  it('ignores online classes (they carry no geometry)', () => {
    expect(hasClassWithin(feed(online(), online()), PARIS_POINT, 100)).toBe(false)
  })
  it('finds a near class among online + far ones', () => {
    expect(hasClassWithin(feed(online(), located(FAR), located(NEAR)), PARIS_POINT, 100)).toBe(true)
  })
})

describe('isLocalRegion', () => {
  it('is false when there is no region centre (not on a region view)', () => {
    expect(isLocalRegion(null, PARIS_POINT, 100)).toBe(false)
    expect(isLocalRegion(undefined, PARIS_POINT, 100)).toBe(false)
  })
  it('is true when the region centre is within the radius (your metro)', () => {
    expect(isLocalRegion(NEAR, PARIS_POINT, 100)).toBe(true)
  })
  it('is false when the region centre is beyond the radius (a whole country)', () => {
    expect(isLocalRegion(FAR, PARIS_POINT, 100)).toBe(false)
  })
})

describe('shouldShowGeolocationPrompt', () => {
  // A baseline where the prompt SHOWS; each case flips exactly one condition.
  const showing = {
    guess: PARIS,
    dismissed: false,
    activeSearch: false,
    geojson: feed(located(NEAR)),
    regionCenter: null,
  }

  it('shows for a resolved guess with a nearby class and nothing suppressing it', () => {
    expect(shouldShowGeolocationPrompt(showing)).toBe(true)
  })
  it('hides when there is no resolved guess', () => {
    expect(shouldShowGeolocationPrompt({ ...showing, guess: null })).toBe(false)
  })
  it('hides when dismissed this session', () => {
    expect(shouldShowGeolocationPrompt({ ...showing, dismissed: true })).toBe(false)
  })
  it('hides when a place search is already active', () => {
    expect(shouldShowGeolocationPrompt({ ...showing, activeSearch: true })).toBe(false)
  })
  it('hides while the feed is still loading', () => {
    expect(shouldShowGeolocationPrompt({ ...showing, geojson: undefined })).toBe(false)
  })
  it('hides when no located class is within range', () => {
    expect(shouldShowGeolocationPrompt({ ...showing, geojson: feed(located(FAR)) })).toBe(false)
  })
  it('hides when the only nearby classes are online', () => {
    expect(shouldShowGeolocationPrompt({ ...showing, geojson: feed(online()) })).toBe(false)
  })
  it('hides when already viewing a region local to the guess', () => {
    expect(shouldShowGeolocationPrompt({ ...showing, regionCenter: NEAR })).toBe(false)
  })
  it('shows when the viewed region is far from the guess (a whole country)', () => {
    expect(shouldShowGeolocationPrompt({ ...showing, regionCenter: FAR })).toBe(true)
  })
  it('a lookup-suppressor wins over an otherwise-showing state (precedence)', () => {
    expect(shouldShowGeolocationPrompt({ ...showing, dismissed: true, regionCenter: FAR })).toBe(
      false,
    )
  })
})

describe('readGeolocationDismissed / markGeolocationDismissed', () => {
  afterEach(() => vi.unstubAllGlobals())

  const stubStorage = () => {
    const store = new Map<string, string>()

    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    })

    return store
  }

  it('reads false before anything is written', () => {
    stubStorage()
    expect(readGeolocationDismissed()).toBe(false)
  })
  it('round-trips the dismiss flag under the session key', () => {
    const store = stubStorage()

    markGeolocationDismissed()
    expect(store.get(GEOLOCATION_DISMISS_KEY)).toBe('1')
    expect(readGeolocationDismissed()).toBe(true)
  })
  it('degrades to "not dismissed" when storage throws (sandboxed embed / private mode)', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(readGeolocationDismissed()).toBe(false)
    expect(() => markGeolocationDismissed()).not.toThrow()
  })
})

describe('nearbyBounds', () => {
  // A [w, s, e, n] box's width/height in degrees — enough to tell "a neighbourhood" from "a
  // pinpoint" and from "half a continent" without asserting turf's exact arithmetic.
  const size = (box: number[]) => ({ width: box[2] - box[0], height: box[3] - box[1] })
  const floorOnly = () => nearbyBounds(PARIS_POINT, feed())

  it('floors a lone coincident class to a neighbourhood, not a zero-area box', () => {
    // The visitor is standing on the only class. Without the floor `boundsOfPoints` returns a
    // degenerate box, and `fitBounds` answers a degenerate box with its maximum zoom — which
    // is the street-corner framing this whole change exists to remove.
    const box = nearbyBounds(PARIS_POINT, feed(located(PARIS_POINT)))

    expect(size(box).width).toBeGreaterThan(0.1)
    expect(size(box).height).toBeGreaterThan(0.1)
  })

  it('floors an empty feed the same way it floors a missing one', () => {
    expect(floorOnly()).toEqual(nearbyBounds(PARIS_POINT, undefined))
  })

  it('does not widen for a class already inside the floor', () => {
    // NEAR is ~5km east, well inside the 25km floor.
    expect(nearbyBounds(PARIS_POINT, feed(located(NEAR)))).toEqual(floorOnly())
  })

  it('caps at NEARBY_MAX_KM, so a distant class cannot widen the frame', () => {
    // FAR is ~500km south — past the radius that decides whether a class counts as near you at
    // all. Framing it would zoom the visitor out to reach a class the app declines to suggest.
    expect(nearbyBounds(PARIS_POINT, feed(located(FAR)))).toEqual(floorOnly())
  })

  it('reaches out to a class past the floor but inside the cap', () => {
    // ~55km east: outside the 25km floor, well inside the 100km cap.
    const mid: [number, number] = [3.1, 48.86]
    const box = nearbyBounds(PARIS_POINT, feed(located(mid)))

    expect(box[2]).toBeGreaterThanOrEqual(mid[0])
    expect(size(box).width).toBeGreaterThan(size(floorOnly()).width)
  })

  it('takes only the nearest `count`, so a sparse tail cannot drag the frame', () => {
    const near: [number, number] = [2.6, 48.86]
    const far: [number, number] = [3.2, 48.86]
    const box = nearbyBounds(PARIS_POINT, feed(located(near), located(far)), { count: 1 })

    expect(box[2]).toBeLessThan(far[0])
  })

  it('ignores online classes, which carry no geometry', () => {
    expect(nearbyBounds(PARIS_POINT, feed(online()))).toEqual(floorOnly())
  })
})
