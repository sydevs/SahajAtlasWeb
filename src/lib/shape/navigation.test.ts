import { describe, it, expect } from 'vitest'

import { atlasDepth, atlasPushState, dismissAction, dismissDepth } from './navigation'

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

describe('atlasPushState', () => {
  it('stamps one level deeper than the current entry', () => {
    expect(atlasPushState({ state: null })).toEqual({ depth: 1 }) // fresh entry → depth 1
    expect(atlasPushState({ state: { depth: 2 } })).toEqual({ depth: 3 })
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

describe('dismissDepth', () => {
  it('counts the URL ancestors for a fresh deep link (depth 0 — every press climbs)', () => {
    // /gb/london/123 opened cold: X climbs area → country → root.
    expect(dismissDepth({ depth: 0, entryAncestors: 3, ancestors: 3 })).toBe(3)
  })

  it('counts ONE panel for a pin clicked from the root, not the URL ancestors', () => {
    // The regression this exists for: /gb/london/123 has 3 URL ancestors, but the
    // widget entered at the root (entryAncestors 0) and pushed once, so a single X
    // goes chronologically back to the root.
    expect(dismissDepth({ depth: 1, entryAncestors: 0, ancestors: 3 })).toBe(1)
  })

  it('adds the entry ancestors still to be climbed once history runs out', () => {
    // Deep-linked to /gb/london (2 ancestors), then opened an event: back to the
    // event's parent, then climb london → gb → root.
    expect(dismissDepth({ depth: 1, entryAncestors: 2, ancestors: 3 })).toBe(3)
  })

  it('matches the URL ancestors for a full in-widget drill-down', () => {
    // root → gb → london → event: depth and structure agree, as they always did.
    expect(dismissDepth({ depth: 3, entryAncestors: 0, ancestors: 3 })).toBe(3)
  })

  it('never exceeds the ancestors the stack can name', () => {
    // A sibling jump (a search result in another country) pushes depth past the new
    // branch's height — there is no fourth panel to draw.
    expect(dismissDepth({ depth: 2, entryAncestors: 0, ancestors: 1 })).toBe(1)
  })

  it('is 0 at the root, which collapses instead of closing', () => {
    expect(dismissDepth({ depth: 0, entryAncestors: 0, ancestors: 0 })).toBe(0)
    expect(dismissDepth({ depth: 4, entryAncestors: 0, ancestors: 0 })).toBe(0)
  })
})
