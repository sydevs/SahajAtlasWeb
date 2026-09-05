import { describe, expect, it } from 'vitest'

import {
  COMPACT_MESSAGE,
  MIN_INTERFACE_HEIGHT_PX,
  MIN_INTERFACE_WIDTH_PX,
  SLOT_GAIN,
  embedLayout,
  mapMode,
  resolveDestination,
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

describe('mapMode — which of the three kinds of map this embed has', () => {
  it('reads containment off the height the host gave the ELEMENT, and nothing else', () => {
    // Map mode renders everything fixed, so `<sahaj-atlas>` measures zero height on its own.
    // A height cannot appear by accident: it is a rule the host wrote, and that is the opt-in.
    expect(mapMode(true, box(1440, 640))).toBe('contained')
    expect(mapMode(true, box(1440, 0))).toBe('viewport')
  })

  it('needs BOTH axes, so an inline-block element is not a box we can fill', () => {
    // `display: inline-block; height: 640px` measures 0x640. The height alone would opt it in,
    // and `decideSlot`'s parent-column width fallback would then clear the floors — leaving the
    // map contained in a box whose `w-full` resolves to nothing.
    expect(mapMode(true, box(0, 640))).toBe('viewport')
    expect(mapMode(true, box(640, 0))).toBe('viewport')
  })

  it('is never contained without an element to be contained by', () => {
    // The standalone build. Its slot IS the viewport, so containing it would mean containing
    // it in itself — and `App` defaults `contained` to false, which this keeps honest.
    expect(mapMode(true, null)).toBe('viewport')
  })

  it("is 'none' for map-less, whatever box it was given", () => {
    // Nothing in `map=false` is `position: fixed`, so there is no containing block to take —
    // and the three-state return is what makes "contained, with no map" unrepresentable.
    expect(mapMode(false, box(1440, 640))).toBe('none')
    expect(mapMode(false, null)).toBe('none')
  })
})

describe('embedLayout', () => {
  const overlay = { kind: 'overlay' } as const
  const none = { kind: 'none' } as const

  it('keeps the full interface when there is nowhere bigger to go', () => {
    expect(embedLayout({ map: 'none', slot: box(300, 400), destination: none })).toEqual({
      layout: 'full',
    })
  })

  describe("a 'viewport' map, where owning the viewport IS the question", () => {
    it.each([
      ['a 768px article column', box(768, 0)],
      ['a 1000px content column — silent before #161', box(1000, 0)],
    ])('degrades %s to the card rather than painting over the page', (_label, slot) => {
      expect(embedLayout({ map: 'viewport', slot, destination: overlay })).toEqual({
        layout: 'compact',
        reason: 'map',
      })
    })

    it('stays full when the map owns its viewport, however small that viewport is', () => {
      // A framed map embed at 400×600: `position: fixed` resolves against the FRAME and
      // `window.innerHeight` IS the frame's height, so every argument behind "map mode needs a
      // full-page slot" is already satisfied. The frame is a viewport, just a small one.
      expect(embedLayout({ map: 'viewport', slot: box(400, 600), destination: none })).toEqual({
        layout: 'full',
      })
    })
  })

  describe("a 'contained' map (#169), which asks the boxed question instead", () => {
    const held = { map: 'contained' } as const

    it('keeps a host-written height:640px in the page instead of carding it', () => {
      // The case this ticket exists for, and the one row of the old table that reverses: an
      // explicit height used to be the clearest evidence a map embed did NOT own the page, so
      // it became a card. Now it is the host saying where the map goes.
      expect(embedLayout({ ...held, slot: box(1440, 640), destination: overlay })).toEqual({
        layout: 'contained',
      })
    })

    it('does not consult viewport ownership at all', () => {
      // A 500px map column beside a sticky header — an overlay is available and irrelevant,
      // because the map is not going to fill the window.
      expect(embedLayout({ ...held, slot: box(500, 600), destination: overlay })).toEqual({
        layout: 'contained',
      })
    })

    it('still degrades below the floors, exactly like map-less', () => {
      // A host CAN size a map embed into a box no interface fits, and that is still a card —
      // which is why `decideSlot` has to reconcile the two answers rather than trusting them.
      expect(embedLayout({ ...held, slot: box(300, 200), destination: overlay })).toEqual({
        layout: 'compact',
        reason: 'floors',
      })
    })

    it('stays contained when there is nowhere bigger to go', () => {
      // A host who sized the element to their whole page. Rendering `full` here would be
      // visually identical but would drop the frame, and with it the stacking context and the
      // box vaul measures against.
      expect(embedLayout({ ...held, slot: box(1440, 900), destination: none })).toEqual({
        layout: 'contained',
      })
    })
  })

  describe("'none', which is container-relative and needs the absolute floor too", () => {
    it('keeps the full interface in a box that merely has room above it', () => {
      // Container-relative by design (#107): a 500px column on a desktop is a perfectly good
      // map-less embed even though an overlay would be bigger.
      expect(embedLayout({ map: 'none', slot: box(500, 600), destination: overlay })).toEqual({
        layout: 'full',
      })
    })

    it('keeps the live 400×600 reference embed at full size', () => {
      expect(embedLayout({ map: 'none', slot: box(400, 600), destination: overlay })).toEqual({
        layout: 'full',
      })
    })

    it('degrades below either floor', () => {
      expect(embedLayout({ map: 'none', slot: box(300, 600), destination: overlay })).toEqual({
        layout: 'compact',
        reason: 'floors',
      })
      expect(embedLayout({ map: 'none', slot: box(500, 300), destination: overlay })).toEqual({
        layout: 'compact',
        reason: 'floors',
      })
    })

    it('does not degrade a padded phone layout', () => {
      // 327px inside a 375px phone is a normal page with 24px of padding.
      // `MIN_EXPANSION_GAIN` at 0.9 called this cramped, and shipped a card
      // over a working embed. At 0.8 the phone resolves to no destination at
      // all, so the floors never get asked.
      const destination = resolveDestination(box(327, 620), PHONE, box(390, 844), false)

      expect(embedLayout({ map: 'none', slot: box(327, 620), destination })).toEqual({
        layout: 'full',
      })
    })
  })
})

describe('the constants, ratcheted', () => {
  it('holds SLOT_GAIN in both directions', () => {
    // Raising it degrades more embeds that are working. Lowering it
    // re-silences the map-mode takeover a 1000px column produces. Both
    // directions are regressions, so both are pinned.
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
