import { describe, it, expect } from 'vitest'

import {
  eventFrameZoom,
  fitBoundsOptions,
  hasMapPoint,
  isWithinPaddedViewport,
  worldMinZoom,
  worldViewCamera,
} from './camera'

// Pure camera-move decisions — the controller owns the zoom values and applies the
// action; live projection/easing is a browser concern, not asserted here.

describe('eventFrameZoom', () => {
  const zooms = { eventZoom: 15, onlineZoom: 7 }

  it('frames an online event only as the session entry point (a deep link)', () => {
    expect(
      eventFrameZoom({
        approximate: true,
        visible: true,
        atDetailZoom: false,
        isEntry: true,
        ...zooms,
      }),
    ).toBe(7)
    // in-session: selecting an online event never moves the camera
    expect(
      eventFrameZoom({
        approximate: true,
        visible: true,
        atDetailZoom: true,
        isEntry: false,
        ...zooms,
      }),
    ).toBeNull()
  })

  it('keeps the current zoom only for a pin already shown at a detail zoom', () => {
    expect(
      eventFrameZoom({
        approximate: false,
        visible: true,
        atDetailZoom: true,
        isEntry: false,
        ...zooms,
      }),
    ).toBeNull()
  })

  it('eases to the event zoom on entry, from a wider view, or when off-screen', () => {
    // deep-link entry — the boot-time world-zoom point projects as "visible", but we
    // still frame it (atDetailZoom false + isEntry).
    expect(
      eventFrameZoom({
        approximate: false,
        visible: true,
        atDetailZoom: false,
        isEntry: true,
        ...zooms,
      }),
    ).toBe(15)
    // wider view — on-screen but not yet at a detail zoom
    expect(
      eventFrameZoom({
        approximate: false,
        visible: true,
        atDetailZoom: false,
        isEntry: false,
        ...zooms,
      }),
    ).toBe(15)
    // off-screen (a list / search click)
    expect(
      eventFrameZoom({
        approximate: false,
        visible: false,
        atDetailZoom: true,
        isEntry: false,
        ...zooms,
      }),
    ).toBe(15)
  })
})

describe('fitBoundsOptions', () => {
  const base = { top: 20, bottom: 20, left: 352, right: 20 }

  it('passes the base padding through and leaves maxZoom unset with no opts', () => {
    expect(fitBoundsOptions(base)).toEqual({
      maxZoom: undefined,
      padding: { top: 20, bottom: 20, left: 352, right: 20 },
    })
  })

  it('adds the extra inset to every side and forwards the maxZoom cap', () => {
    expect(fitBoundsOptions(base, { maxZoom: 13, padding: 48 })).toEqual({
      maxZoom: 13,
      padding: { top: 68, bottom: 68, left: 400, right: 68 },
    })
  })

  it('treats missing base sides as 0', () => {
    expect(fitBoundsOptions({}, { padding: 48 })).toEqual({
      maxZoom: undefined,
      padding: { top: 48, bottom: 48, left: 48, right: 48 },
    })
  })
})

describe('isWithinPaddedViewport', () => {
  const size = { width: 1000, height: 800 }
  const padding = { top: 20, bottom: 120, left: 352, right: 20 }

  it('is true for a point inside the padded box', () => {
    expect(isWithinPaddedViewport({ x: 500, y: 400 }, size, padding)).toBe(true)
  })

  it('is true on the exact padded boundary', () => {
    expect(isWithinPaddedViewport({ x: 352, y: 20 }, size, padding)).toBe(true)
    expect(isWithinPaddedViewport({ x: 980, y: 680 }, size, padding)).toBe(true)
  })

  it('is false past any edge (drawer footprint excluded)', () => {
    expect(isWithinPaddedViewport({ x: 351, y: 400 }, size, padding)).toBe(false) // under the drawer
    expect(isWithinPaddedViewport({ x: 981, y: 400 }, size, padding)).toBe(false) // right of viewport
    expect(isWithinPaddedViewport({ x: 500, y: 19 }, size, padding)).toBe(false) // above top
    expect(isWithinPaddedViewport({ x: 500, y: 681 }, size, padding)).toBe(false) // below peek
  })
})

describe('hasMapPoint', () => {
  it('is true only when both coordinates are stored', () => {
    expect(hasMapPoint({ address: { latitude: 43.65, longitude: -79.38 } })).toBe(true)
    // 0 is a real coordinate, not a missing one.
    expect(hasMapPoint({ address: { latitude: 0, longitude: 0 } })).toBe(true)
  })

  it('is false for a placeless event, the online shape SahajCloud returns', () => {
    expect(hasMapPoint({ address: { latitude: null, longitude: null } })).toBe(false)
    expect(hasMapPoint({ address: { latitude: 43.65, longitude: null } })).toBe(false)
    expect(hasMapPoint({ address: null })).toBe(false)
    expect(hasMapPoint({})).toBe(false)
  })
})

describe('worldViewCamera', () => {
  const desktop = { width: 1280, height: 800 }
  const world: [number, number] = [0, 20]
  // The one part of Mapbox's projection this helper owns: the world is 512px wide at zoom 0
  // and doubles each level. Everything else — how a longitude lands on screen, and the clamp
  // the helper exists to stay inside — is Mapbox's, and only a browser can confirm it, so
  // nothing here models either.
  const worldPx = (zoom: number) => 512 * 2 ** zoom

  it('makes the world as wide as the map plus the whole padding difference', () => {
    // One spare px beyond the difference, so an edge is never a sub-pixel short.
    expect(worldPx(worldViewCamera(desktop, { left: 372, right: 308 }, world).zoom)).toBeCloseTo(
      1280 + 64 + 1,
    )
    expect(worldPx(worldViewCamera(desktop, { left: 372, right: 20 }, world).zoom)).toBeCloseTo(
      1280 + 352 + 1,
    )
  })

  it('widens by the same amount whichever side is heavier', () => {
    expect(worldViewCamera(desktop, { left: 20, right: 372 }, world).zoom).toBe(
      worldViewCamera(desktop, { left: 372, right: 20 }, world).zoom,
    )
  })

  it('never makes the world narrower than the map is tall', () => {
    // A phone is taller than wide, and its padding is even, so the height decides.
    const camera = worldViewCamera({ width: 390, height: 844 }, { left: 20, right: 20 }, world)

    expect(worldPx(camera.zoom)).toBeCloseTo(844)
  })

  it('changes nothing where the padding is even, as on a phone', () => {
    expect(
      worldViewCamera({ width: 390, height: 844 }, { left: 20, right: 20, bottom: 376 }, world)
        .center,
    ).toEqual(world)
  })

  it('passes the latitude through for Mapbox to clamp', () => {
    expect(worldViewCamera(desktop, { left: 372, right: 20 }, [0, 20]).center[1]).toBe(20)
  })

  // A 1633px world over a 1280px map leaves only a 39° band of centres that still reaches both
  // edges, and the side panel puts that band east of the antimeridian's own. A centre inside it
  // is passed through; one outside moves to the nearer end, never past it.
  it('clamps a centre that would leave an edge blank, and keeps one that would not', () => {
    const centre = (lng: number) =>
      worldViewCamera(desktop, { left: 372, right: 20 }, [lng, 20]).center[0]

    expect(centre(0)).toBe(0)
    expect(centre(-170)).toBeCloseTo(-0.11, 2)
    expect(centre(-40)).toBeCloseTo(-0.11, 2)
    expect(centre(170)).toBeCloseTo(38.91, 2)
  })

  it('mirrors the band for padding that is heavier on the right', () => {
    const centre = (lng: number) =>
      worldViewCamera(desktop, { left: 20, right: 372 }, [lng, 20]).center[0]

    expect(centre(0)).toBe(0)
    expect(centre(170)).toBeCloseTo(0.11, 2)
    expect(centre(-170)).toBeCloseTo(-38.91, 2)
  })

  it('leaves a map with no size to Mapbox', () => {
    expect(worldViewCamera({ width: 0, height: 0 }, {}, world)).toEqual({ center: world, zoom: 0 })
  })
})

describe('worldMinZoom', () => {
  it('stops zooming out where one world is as wide as the map', () => {
    expect(worldMinZoom(1024)).toBe(1)
    expect(worldMinZoom(2560)).toBeCloseTo(Math.log2(5))
  })

  it('leaves a map narrower than the world free to zoom out to the whole world', () => {
    expect(worldMinZoom(390)).toBe(0)
    expect(worldMinZoom(512)).toBe(0)
    expect(worldMinZoom(0)).toBe(0)
  })
})
