import { describe, it, expect } from 'vitest'

import { eventFrameAction, fitBoundsOptions, isWithinPaddedViewport } from './camera'

// Pure camera-move decisions — the controller owns the zoom values and applies the
// action; live projection/easing is a browser concern, not asserted here.

describe('eventFrameAction', () => {
  it('never moves for an online/approximate event (select the marker only)', () => {
    expect(eventFrameAction(true, true)).toBe('select')
    expect(eventFrameAction(true, false)).toBe('select')
  })

  it('keeps the current zoom for an on-screen pin (pin click)', () => {
    expect(eventFrameAction(false, true)).toBe('keep')
  })

  it('eases in for an off-screen event (list / search click)', () => {
    expect(eventFrameAction(false, false)).toBe('move')
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
