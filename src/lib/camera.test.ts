import { describe, it, expect } from 'vitest'

import { eventFrameZoom, fitBoundsOptions, isWithinPaddedViewport } from './camera'

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
