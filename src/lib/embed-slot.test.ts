import { describe, expect, it } from 'vitest'

import {
  BOXED_SLOT_RATIO,
  COMPACT_MAX_HEIGHT_PX,
  COMPACT_MAX_WIDTH_PX,
  MIN_EXPANSION_GAIN,
  NARROW_SLOT_RATIO,
  SLOT_WARNING_MESSAGE,
  embedForm,
  mapSlotWarning,
  resolveEmbedForm,
} from './embed-slot'

// Map mode requires a full-page slot (issue #107). This predicate is what makes that
// requirement audible instead of leaving the host to discover it as a widget painting over
// their page. It warns into a stranger's console, so the cases that must NOT fire matter
// more here than the ones that must.

const FULL_PAGE = {
  slotWidth: 1440,
  elementWidth: 0,
  elementHeight: 0,
  viewportWidth: 1440,
  viewportHeight: 900,
}

describe('mapSlotWarning — stays quiet', () => {
  it('for a full-page slot', () => {
    expect(mapSlotWarning(FULL_PAGE)).toBeNull()
  })

  // A host that DID size the element, but to the full page — `height: 100vh` on the embed is
  // a perfectly good map-mode integration and must not be scolded for being explicit.
  it.each([900, 880, 1200])('for an element %ipx tall on a 900px viewport', (elementHeight) => {
    expect(mapSlotWarning({ ...FULL_PAGE, elementHeight })).toBeNull()
  })

  // A centred layout, body margins, a scrollbar, a padded article column — all normal, none
  // of them an integration mistake. The threshold is slack on purpose.
  it.each([1440, 1200, 1000, 900])(
    'for a host column of %ipx on a 1440px viewport',
    (slotWidth) => {
      expect(mapSlotWarning({ ...FULL_PAGE, slotWidth })).toBeNull()
    },
  )

  // Before layout, in a hidden tab, or in a detached test harness. A widget that cannot be
  // measured is not a widget that is wrong.
  it.each([
    { viewportWidth: 0, viewportHeight: 0 },
    { viewportWidth: Number.NaN, viewportHeight: Number.NaN },
    { slotWidth: 0, elementHeight: 0 },
  ])('when the metrics are not yet real (%p)', (partial) => {
    expect(mapSlotWarning({ ...FULL_PAGE, ...partial })).toBeNull()
  })
})

describe('mapSlotWarning — reports', () => {
  it('a sidebar column', () => {
    expect(mapSlotWarning({ ...FULL_PAGE, slotWidth: 320 })).toBe('narrow')
  })

  it('an element the host gave its own height', () => {
    expect(mapSlotWarning({ ...FULL_PAGE, elementHeight: 640 })).toBe('boxed')
  })

  // Both wrong at once is one message, and it is the more actionable one: the mode is the
  // mistake, not the height.
  it('the column first when a slot is both narrow and boxed', () => {
    expect(mapSlotWarning({ ...FULL_PAGE, slotWidth: 320, elementHeight: 640 })).toBe('narrow')
  })

  it('every case with a message that names the fix', () => {
    for (const message of Object.values(SLOT_WARNING_MESSAGE)) {
      expect(message).toContain('map="false"')
    }
  })
})

describe('the thresholds', () => {
  // Pinned as a ratchet: LOOSENING either one is a decision to warn more strangers, and
  // should be a visible line in a diff rather than a nudged constant.
  //
  // Not "slack enough that no normal page trips them" — 0.6 does fire for a centred
  // `max-w-3xl` article column on a 1440px viewport. That is a CORRECT warning by this
  // feature's own definition (map mode would paint over exactly that page), not a false
  // positive; the slackness is about not warning a full-page embed that merely has margins.
  it('cannot be loosened without saying so', () => {
    expect(NARROW_SLOT_RATIO).toBeLessThanOrEqual(0.6)
    expect(BOXED_SLOT_RATIO).toBeLessThanOrEqual(0.8)
  })
})

// ── Does the interface fit? (issue #161) ───────────────────────────────────────
//
// Same shape as the block above, and for the same reason inverted: `embedForm` decides what
// RENDERS, so a false "compact" takes the interface away from a slot that could have held it.
// The cases that must stay `full` are therefore the ones worth enumerating.

/** The live reference case: `sahajayoga.nl` embeds at a hard-coded 400×600. */
const REFERENCE_EMBED = {
  slotWidth: 400,
  elementWidth: 400,
  elementHeight: 600,
  viewportWidth: 1440,
  viewportHeight: 900,
}

/** A phone, full-bleed: the slot IS the screen, so there is nothing to expand into. */
const PHONE = {
  slotWidth: 320,
  elementWidth: 320,
  elementHeight: 568,
  viewportWidth: 320,
  viewportHeight: 568,
}

describe('embedForm — keeps the full interface', () => {
  it('for a full-page map-mode slot', () => {
    expect(embedForm(FULL_PAGE)).toBe('full')
  })

  // The threshold's whole purpose: this slot is small, and the interface still fits it.
  it('for the 400×600 reference embed', () => {
    expect(embedForm(REFERENCE_EMBED)).toBe('full')
  })

  // The floors are absolute, so on their own they would call every phone too small. This is
  // the case that makes `MIN_EXPANSION_GAIN` load-bearing rather than decorative.
  it.each([320, 360, 375, 414])('for a full-bleed embed on a %ipx phone', (width) => {
    expect(
      embedForm({ ...PHONE, slotWidth: width, elementWidth: width, viewportWidth: width }),
    ).toBe('full')
  })

  // Before layout, in a hidden tab, in a detached harness: never degrade on a number we
  // do not have. Mirrors `mapSlotWarning`'s null cases.
  it.each([
    { viewportWidth: 0, viewportHeight: 0 },
    { viewportWidth: Number.NaN, viewportHeight: Number.NaN },
    { slotWidth: 0, elementWidth: 0, elementHeight: 0 },
    { slotWidth: Number.NaN, elementWidth: Number.NaN, elementHeight: Number.NaN },
  ])('when the metrics are not yet real (%p)', (partial) => {
    expect(embedForm({ ...REFERENCE_EMBED, ...partial })).toBe('full')
  })

  // A tall map-mode embed in a wide column: no element box at all, and the column is fine.
  it('for a map-mode embed with no box of its own', () => {
    expect(embedForm({ ...FULL_PAGE, slotWidth: 1200 })).toBe('full')
  })
})

describe('embedForm — degrades to the compact card', () => {
  it('for a sidebar column narrower than the interface', () => {
    expect(embedForm({ ...REFERENCE_EMBED, slotWidth: 300, elementWidth: 300 })).toBe('compact')
  })

  it('for a slot too short for the interface', () => {
    expect(embedForm({ ...REFERENCE_EMBED, elementHeight: 300 })).toBe('compact')
  })

  // A short embed on a phone IS cramped — the screen could have given it more. The guard
  // is about the slot matching the viewport, not about being on a small device.
  it('for a short embed on a phone', () => {
    expect(embedForm({ ...PHONE, elementHeight: 300 })).toBe('compact')
  })

  // The element's own box wins over the host's column: a 300px element inside a 1200px
  // column is a 300px slot, whatever room the column had spare.
  it('reading the element box in preference to the column', () => {
    expect(embedForm({ ...REFERENCE_EMBED, slotWidth: 1200, elementWidth: 300 })).toBe('compact')
  })

  // …and falls back to the column only when the element has no width of its own.
  it('reading the column when the element has no box', () => {
    expect(embedForm({ ...REFERENCE_EMBED, slotWidth: 300, elementWidth: 0 })).toBe('compact')
  })
})

describe('resolveEmbedForm — the host has the last word', () => {
  it('renders compact wherever `always` is set, without a warning', () => {
    for (const metrics of [FULL_PAGE, REFERENCE_EMBED, PHONE]) {
      expect(resolveEmbedForm('always', metrics)).toEqual({ form: 'compact', warning: null })
    }
  })

  it('keeps the full interface wherever `never` is set', () => {
    expect(resolveEmbedForm('never', { ...REFERENCE_EMBED, elementHeight: 300 }).form).toBe('full')
  })

  it('measures under `auto`', () => {
    expect(resolveEmbedForm('auto', REFERENCE_EMBED).form).toBe('full')
    expect(resolveEmbedForm('auto', { ...REFERENCE_EMBED, elementHeight: 300 }).form).toBe(
      'compact',
    )
  })
})

describe('resolveEmbedForm — what the host hears', () => {
  const CRAMPED = { ...REFERENCE_EMBED, elementWidth: 300, elementHeight: 320 }

  // #149's diagnostic contract: the measured size and the threshold, both in the sentence,
  // so the reader can compare them without opening this file.
  it('names the measured size and the threshold when it enters compact', () => {
    const { warning } = resolveEmbedForm('auto', CRAMPED)

    expect(warning).toContain('300×320px')
    expect(warning).toContain(`${COMPACT_MAX_WIDTH_PX}×${COMPACT_MAX_HEIGHT_PX}px`)
  })

  // The host said "don't", so nothing changes — but they still hear it once.
  it('says so when `never` declines a slot that does not fit', () => {
    const { warning } = resolveEmbedForm('never', CRAMPED)

    expect(warning).toContain('300×320px')
    expect(warning).toContain('compact=never')
  })

  it('stays quiet in a slot that fits, whichever way the host set it', () => {
    expect(resolveEmbedForm('auto', REFERENCE_EMBED).warning).toBeNull()
    expect(resolveEmbedForm('never', REFERENCE_EMBED).warning).toBeNull()
    // `always` is a decision, not a discovery: nothing was measured, so there is nothing
    // to report and the host already knows.
    expect(resolveEmbedForm('always', CRAMPED).warning).toBeNull()
  })
})

describe('the compact thresholds', () => {
  // A ratchet, like the ratios above: RAISING either floor degrades more embeds that were
  // rendering the full interface yesterday, which is a decision worth seeing in a diff.
  it('cannot be raised without saying so', () => {
    expect(COMPACT_MAX_WIDTH_PX).toBeLessThanOrEqual(360)
    expect(COMPACT_MAX_HEIGHT_PX).toBeLessThanOrEqual(420)
  })

  // Below 1, or the guard would never fire and every phone would go compact; below it,
  // a slot that all but fills the screen would degrade for nothing.
  it('only degrades a slot the overlay would improve on', () => {
    expect(MIN_EXPANSION_GAIN).toBeLessThan(1)
    expect(MIN_EXPANSION_GAIN).toBeGreaterThan(0.5)
  })
})
