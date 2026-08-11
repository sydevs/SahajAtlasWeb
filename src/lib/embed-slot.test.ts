import { describe, expect, it } from 'vitest'

import {
  BOXED_SLOT_RATIO,
  NARROW_SLOT_RATIO,
  SLOT_WARNING_MESSAGE,
  mapSlotWarning,
} from './embed-slot'

// Map mode requires a full-page slot (issue #107). This predicate is what makes that
// requirement audible instead of leaving the host to discover it as a widget painting over
// their page. It warns into a stranger's console, so the cases that must NOT fire matter
// more here than the ones that must.

const FULL_PAGE = {
  slotWidth: 1440,
  elementHeight: 0,
  viewportWidth: 1440,
  viewportHeight: 900,
}

describe('mapSlotWarning — stays quiet', () => {
  it('for a full-page slot', () => {
    expect(mapSlotWarning(FULL_PAGE)).toBeNull()
  })

  // The element itself measures 0 in a correct map-mode embed: it is an unstyled inline
  // custom element whose content is all `position: fixed`. Zero must read as "no height
  // was asked for", never as a box of height zero.
  it('for an element with no height of its own', () => {
    expect(mapSlotWarning({ ...FULL_PAGE, elementHeight: 0 })).toBeNull()
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
  // Pinned as a ratchet: tightening either one is a decision to warn more strangers, and
  // should be a visible line in a diff rather than a nudged constant.
  it('are slack enough that a normal page cannot trip them', () => {
    expect(NARROW_SLOT_RATIO).toBeLessThanOrEqual(0.6)
    expect(BOXED_SLOT_RATIO).toBeLessThanOrEqual(0.8)
  })
})
