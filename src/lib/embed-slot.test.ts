import { describe, expect, it } from 'vitest'

import {
  COMPACT_MESSAGE,
  MIN_INTERFACE_HEIGHT_PX,
  MIN_INTERFACE_WIDTH_PX,
  SLOT_GAIN,
  SURFACE_MIN_COVERAGE,
  embedLayout,
  resolveDestination,
  surfaceCoversPage,
} from './embed-slot'

const box = (width: number, height: number) => ({ width, height })

const DESKTOP = box(1440, 900)
const PHONE = box(375, 667)

describe('resolveDestination', () => {
  it('offers the in-page overlay when the viewport is meaningfully bigger than the slot', () => {
    expect(resolveDestination(box(300, 400), DESKTOP, DESKTOP, false)).toEqual({ kind: 'overlay' })
  })

  it('offers nothing when the slot already IS the viewport and we are top-level', () => {
    // The standalone build's own case, and a phone: there is no bigger box to expand into, so
    // degrading would take the interface away and hand back nothing.
    expect(resolveDestination(PHONE, PHONE, box(390, 844), false)).toEqual({ kind: 'none' })
  })

  it('offers a new tab when a frame is meaningfully smaller than the screen', () => {
    // The live reference shape: a small hand-written iframe on a desktop page.
    expect(resolveDestination(box(320, 480), box(320, 480), DESKTOP, true)).toEqual({
      kind: 'link',
    })
  })

  it('prefers the overlay over the link when the frame is roomy', () => {
    // A web component inside a GENEROUSLY sized iframe — page builders and CMS previews make
    // these. Discriminating on "am I framed" would send this visitor off-site while a
    // 1200×800 overlay sat available.
    expect(resolveDestination(box(300, 400), box(1200, 800), DESKTOP, true)).toEqual({
      kind: 'overlay',
    })
  })

  it('offers nothing when the screen reports the content window (anti-fingerprinting)', () => {
    // Firefox `resistFingerprinting` and Safari Lockdown make `screen.*` report the content
    // window, so `screen ≈ viewport` and no destination resolves. Named explicitly because the
    // degradation is SILENT: the embed stays full and cramped rather than erroring.
    expect(resolveDestination(box(320, 480), box(320, 480), box(320, 480), true)).toEqual({
      kind: 'none',
    })
  })

  it('ignores an axis nothing could measure', () => {
    // Map mode measures no height — at first render the element is still empty — so a
    // predicate requiring both axes would never fire in the mode this exists to serve.
    expect(resolveDestination(box(300, 0), DESKTOP, DESKTOP, false)).toEqual({ kind: 'overlay' })
    expect(resolveDestination(box(0, 0), DESKTOP, DESKTOP, false)).toEqual({ kind: 'none' })
  })
})

describe('embedLayout', () => {
  const overlay = { kind: 'overlay' } as const
  const none = { kind: 'none' } as const

  it('keeps the full interface when there is nowhere bigger to go', () => {
    expect(embedLayout({ hasMap: false, slot: box(300, 400), destination: none })).toEqual({
      layout: 'full',
    })
  })

  describe('map mode, where owning the viewport IS the question', () => {
    it.each([
      ['a 768px article column', box(768, 0)],
      ['a 1000px content column — silent before this change', box(1000, 0)],
      ['a host-written height:640px in a 900 viewport', box(1440, 640)],
    ])('degrades %s to the card rather than painting over the page', (_label, slot) => {
      expect(embedLayout({ hasMap: true, slot, destination: overlay })).toEqual({
        layout: 'compact',
        reason: 'map',
      })
    })

    it('stays full when the map owns its viewport, however small that viewport is', () => {
      // A framed map embed at 400×600: `position: fixed` resolves against the FRAME and
      // `window.innerHeight` IS the frame's height, so every argument behind "map mode needs a
      // full-page slot" is already satisfied. The frame is a viewport, just a small one.
      expect(embedLayout({ hasMap: true, slot: box(400, 600), destination: none })).toEqual({
        layout: 'full',
      })
    })
  })

  describe('map-less, which is container-relative and needs the absolute floor too', () => {
    it('keeps the full interface in a box that merely has room above it', () => {
      // Container-relative by design (#107): a 500px column on a desktop is a perfectly good
      // map-less embed even though an overlay would be bigger.
      expect(embedLayout({ hasMap: false, slot: box(500, 600), destination: overlay })).toEqual({
        layout: 'full',
      })
    })

    it('keeps the live 400×600 reference embed at full size', () => {
      expect(embedLayout({ hasMap: false, slot: box(400, 600), destination: overlay })).toEqual({
        layout: 'full',
      })
    })

    it('degrades below either floor', () => {
      expect(embedLayout({ hasMap: false, slot: box(300, 600), destination: overlay })).toEqual({
        layout: 'compact',
        reason: 'floors',
      })
      expect(embedLayout({ hasMap: false, slot: box(500, 300), destination: overlay })).toEqual({
        layout: 'compact',
        reason: 'floors',
      })
    })

    it('does not degrade a padded phone layout', () => {
      // 327px inside a 375px phone is a normal page with 24px of padding. `MIN_EXPANSION_GAIN`
      // at 0.9 called this cramped and shipped a card over a working embed; at 0.8 the phone
      // resolves to no destination at all, so the floors never get asked.
      const destination = resolveDestination(box(327, 620), PHONE, box(390, 844), false)

      expect(embedLayout({ hasMap: false, slot: box(327, 620), destination })).toEqual({
        layout: 'full',
      })
    })
  })
})

describe('the constants, ratcheted', () => {
  it('holds SLOT_GAIN in both directions', () => {
    // Raising it degrades more embeds that are working; lowering it re-silences the map-mode
    // takeover a 1000px column produces. Both directions are regressions, so both are pinned.
    expect(SLOT_GAIN).toBe(0.8)
  })

  it('does not let the interface floors drift upward', () => {
    expect(MIN_INTERFACE_WIDTH_PX).toBeLessThanOrEqual(360)
    expect(MIN_INTERFACE_HEIGHT_PX).toBeLessThanOrEqual(420)
  })

  it('names the measured size and the fix in each reason', () => {
    expect(COMPACT_MESSAGE.floors).toContain(`${MIN_INTERFACE_WIDTH_PX}×${MIN_INTERFACE_HEIGHT_PX}`)
    // The two reasons earn opposite advice, and telling a map host to "give the element more
    // room" would point them away from the fix.
    expect(COMPACT_MESSAGE.map).toContain('map=false')
    expect(COMPACT_MESSAGE.floors).not.toContain('map=false')
  })
})

describe('surfaceCoversPage', () => {
  it('accepts a surface that covers the viewport', () => {
    expect(surfaceCoversPage(box(1440, 900), 1440, 900)).toBe(true)
  })

  it('tolerates a scrollbar and sub-pixel rounding', () => {
    expect(surfaceCoversPage(box(1425, 900), 1440, 900)).toBe(true)
  })

  it('refuses a surface confined to the embed slot', () => {
    expect(surfaceCoversPage(box(300, 400), 1440, 900)).toBe(false)
  })

  it('refuses a hidden surface', () => {
    expect(surfaceCoversPage(box(0, 0), 1440, 900)).toBe(false)
  })

  it('assumes the best when the viewport cannot be measured', () => {
    // No evidence of a problem is not evidence of a problem: a surface we cannot measure must
    // not be torn down on suspicion.
    expect(surfaceCoversPage(box(300, 400), 0, 0)).toBe(true)
  })

  it('keeps its coverage floor slack', () => {
    expect(SURFACE_MIN_COVERAGE).toBeLessThanOrEqual(0.5)
  })
})
