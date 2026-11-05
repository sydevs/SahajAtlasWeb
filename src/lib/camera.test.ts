import { describe, it, expect } from 'vitest'

import { eventFrameZoom, fitBoundsOptions, isWithinPaddedViewport, worldViewCamera } from './camera'

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

describe('worldViewCamera', () => {
  // Where the world lands on screen for a camera, worked out the way Mapbox draws it: the camera
  // centre at the padded centre, the world 512px wide at zoom 0.
  const drawn = (
    size: { width: number; height: number },
    padding: { left: number; right: number },
    camera: { center: [number, number]; zoom: number },
  ) => {
    const worldPx = 512 * 2 ** camera.zoom
    const paddedCentre = size.width / 2 + (padding.left - padding.right) / 2
    const left = paddedCentre - ((camera.center[0] + 180) / 360) * worldPx
    // Mapbox keeps the camera centre half a canvas inside the world, ignoring the padding.
    const centreX = ((camera.center[0] + 180) / 360) * worldPx

    return {
      left,
      right: left + worldPx,
      clamped:
        centreX < size.width / 2 - 0.01 ||
        centreX > worldPx - size.width / 2 + 0.01 ||
        worldPx < size.height - 0.01,
    }
  }
  const desktop = { width: 1280, height: 800 }
  const world: [number, number] = [0, 20]

  it.each([
    ['filters panel open', { left: 372, right: 308 }],
    ['filters panel closed', { left: 372, right: 20 }],
  ])('leaves no blank edge on a 1280px map with the %s', (_, padding) => {
    const camera = worldViewCamera(desktop, { ...padding, top: 20, bottom: 20 }, world)
    const { left, right, clamped } = drawn(desktop, padding, camera)

    expect(left).toBeLessThanOrEqual(0)
    expect(right).toBeGreaterThanOrEqual(desktop.width)
    // Mapbox would otherwise move the camera itself, and put the strip back.
    expect(clamped).toBe(false)
  })

  it('widens the world by the whole padding difference', () => {
    // Open: 372 - 308 = 64px of difference (and one spare px). Closed: 352px.
    expect(512 * 2 ** worldViewCamera(desktop, { left: 372, right: 308 }, world).zoom).toBeCloseTo(
      1345,
    )
    expect(512 * 2 ** worldViewCamera(desktop, { left: 372, right: 20 }, world).zoom).toBeCloseTo(
      1633,
    )
  })

  it('keeps the asked-for centre in the middle of the padded area', () => {
    const open = worldViewCamera(desktop, { left: 372, right: 308 }, world)

    expect(open.center[0]).toBeCloseTo(0, 1)
    // The latitude is left for Mapbox to clamp, as before.
    expect(open.center[1]).toBe(20)
  })

  it('moves the longitude only as far as it takes to fill an edge', () => {
    // A centre far to the west would leave the left edge blank. It moves east until the world's
    // left edge meets the map's.
    const padding = { left: 372, right: 20 }
    const camera = worldViewCamera(desktop, padding, [-170, 20])
    const { left, right, clamped } = drawn(desktop, padding, camera)

    expect(camera.center[0]).toBeGreaterThan(-170)
    expect(left).toBeCloseTo(0)
    expect(right).toBeGreaterThanOrEqual(desktop.width)
    expect(clamped).toBe(false)
  })

  it('changes nothing where the padding is even, as on a phone', () => {
    const phone = { width: 390, height: 844 }
    const camera = worldViewCamera(phone, { left: 20, right: 20, top: 20, bottom: 376 }, world)

    expect(camera.center).toEqual(world)
    // A phone is taller than wide, so the world is as tall as the map, as Mapbox makes it.
    expect(512 * 2 ** camera.zoom).toBeCloseTo(844)
  })

  it('mirrors for padding that is heavier on the right', () => {
    const padding = { left: 20, right: 372 }
    const camera = worldViewCamera(desktop, padding, world)
    const { left, right, clamped } = drawn(desktop, padding, camera)

    expect(left).toBeLessThanOrEqual(0)
    expect(right).toBeGreaterThanOrEqual(desktop.width)
    expect(clamped).toBe(false)
  })

  it('leaves a map with no size to Mapbox', () => {
    expect(worldViewCamera({ width: 0, height: 0 }, {}, world)).toEqual({ center: world, zoom: 0 })
  })
})
