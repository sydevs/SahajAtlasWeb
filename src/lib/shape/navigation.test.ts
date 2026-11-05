import { describe, it, expect } from 'vitest'

import {
  atlasDepth,
  atlasPushState,
  backDestination,
  breadcrumbTrail,
  dismissAction,
} from './navigation'

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

describe('atlasPushState from', () => {
  it('records where the push left, query included', () => {
    expect(atlasPushState({ pathname: '/search', search: '?q=Prague', state: null })).toEqual({
      depth: 1,
      from: '/search?q=Prague',
    })
  })
})

describe('backDestination', () => {
  it('has nothing to go back to at the root', () => {
    expect(backDestination({ pathname: '/', state: { depth: 3, from: '/gb' } })).toBeUndefined()
  })

  it('names the entry history will land on when the visitor arrived from a search', () => {
    expect(
      backDestination({
        pathname: '/cz/praha/lipanska-8734/1129',
        state: { depth: 2, from: '/search?q=Prague' },
      }),
    ).toBe('/search?q=Prague')
  })

  it('climbs one level on a fresh deep link', () => {
    expect(backDestination({ pathname: '/gb/south-east/london/711' })).toBe('/gb/south-east/london')
    expect(backDestination({ pathname: '/gb' })).toBe('/')
  })

  it('keeps the query when climbing back into a search', () => {
    expect(backDestination({ pathname: '/search/filters', search: '?q=Prague' })).toBe(
      '/search?q=Prague',
    )
  })

  it('names a parent when a stale depth has no record of where it came from', () => {
    expect(backDestination({ pathname: '/gb', state: { depth: 1 } })).toBe('/')
  })
})

describe('breadcrumbTrail', () => {
  const paths = (pathname: string) => breadcrumbTrail(pathname).map((entry) => entry.path)

  it('has nothing to add on a country or a first-level region', () => {
    expect(paths('/gb')).toEqual([])
    expect(paths('/gb/south-east')).toEqual([])
    expect(paths('/nz/1')).toEqual([])
  })

  it('leaves the page itself to the heading', () => {
    expect(paths('/gb/south-east/canterbury')).toEqual(['/gb', '/gb/south-east'])
  })

  it('lists where a class sits, without the class itself', () => {
    expect(paths('/cz/jihlava/757')).toEqual(['/cz', '/cz/jihlava'])
  })

  it('includes the online roll-up a class was opened from', () => {
    expect(paths('/gb/online/12')).toEqual(['/gb', '/gb/online'])
  })
})
