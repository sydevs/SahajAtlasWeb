import { describe, it, expect } from 'vitest'

import { atlasDepth, dismissAction } from './navigation'

// The in-widget history shaping that turns a chronological-back dismiss on and the
// structural-parent climb off (or vice-versa). Pure decisions, so we drive them with
// bare location-shaped objects — the components that stamp/apply depth are exercised
// in the browser, not here.

describe('atlasDepth', () => {
  it('is 0 for a fresh deep link (no state / non-object state)', () => {
    expect(atlasDepth({ state: null })).toBe(0)
    expect(atlasDepth({ state: undefined })).toBe(0)
    expect(atlasDepth({})).toBe(0)
    expect(atlasDepth({ state: 'anything' })).toBe(0)
  })

  it('reads a stamped numeric depth', () => {
    expect(atlasDepth({ state: { depth: 1 } })).toBe(1)
    expect(atlasDepth({ state: { depth: 4 } })).toBe(4)
    expect(atlasDepth({ state: { depth: 0 } })).toBe(0)
  })

  it('ignores a non-numeric or absent depth on an object state', () => {
    expect(atlasDepth({ state: {} })).toBe(0)
    expect(atlasDepth({ state: { depth: '3' } })).toBe(0)
    expect(atlasDepth({ state: { other: 5 } })).toBe(0)
  })
})

describe('dismissAction', () => {
  it('collapses the root view (no parent) regardless of depth', () => {
    expect(dismissAction({ hasParent: false, depth: 0 })).toBe('collapse')
    expect(dismissAction({ hasParent: false, depth: 3 })).toBe('collapse')
  })

  it('goes chronologically back when in-widget history exists (depth > 0)', () => {
    expect(dismissAction({ hasParent: true, depth: 1 })).toBe('back')
    expect(dismissAction({ hasParent: true, depth: 9 })).toBe('back')
  })

  it('climbs to the structural parent for a fresh deep link (depth 0)', () => {
    // Never `back` at depth 0 — the embedded widget shares history with the host page.
    expect(dismissAction({ hasParent: true, depth: 0 })).toBe('fallback')
  })
})
