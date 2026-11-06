import { describe, it, expect } from 'vitest'

import {
  atlasDepth,
  atlasPushState,
  backDestination,
  breadcrumbTrail,
  cameUpFrom,
  climbDestination,
  climbedUpFrom,
  dismissAction,
  loneClassPath,
  placedPathname,
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

describe('loneClassPath — a place with one class opens it', () => {
  const place = (over: Partial<Parameters<typeof loneClassPath>[0]> = {}) => ({
    subregions: [],
    events: [],
    onlineEvents: [],
    ...over,
  })

  it('opens the class of a country whose only city holds one class', () => {
    expect(
      loneClassPath(place({ subregions: [{ singleEventPath: '/lu/luxembourg/1185' }] }), false),
    ).toBe('/lu/luxembourg/1185')
  })

  it('opens the one class a leaf place lists itself', () => {
    expect(loneClassPath(place({ events: [{ path: '/lu/1185' }] }), false)).toBe('/lu/1185')
  })

  it('keeps the page when there is more than one to choose from', () => {
    expect(loneClassPath(place({ subregions: [{}] }), false)).toBeUndefined()
    expect(
      loneClassPath(
        place({ subregions: [{ singleEventPath: '/a/1' }, { singleEventPath: '/b/2' }] }),
        false,
      ),
    ).toBeUndefined()
    expect(
      loneClassPath(place({ events: [{ path: '/x/1' }], onlineEvents: [{}] }), false),
    ).toBeUndefined()
  })

  it('keeps the page while a filter narrows the list', () => {
    expect(loneClassPath(place({ events: [{ path: '/lu/1185' }] }), true)).toBeUndefined()
  })
})

describe('cameUpFrom — leaving the lone class never bounces back into it', () => {
  it('is true after a climb or a link from that class, query ignored', () => {
    expect(cameUpFrom({ state: { climbedFrom: '/lu/1185' } }, '/lu/1185')).toBe(true)
    expect(cameUpFrom({ state: { depth: 1, from: '/lu/1185?locale=fr' } }, '/lu/1185')).toBe(true)
  })

  it('is true two levels up: from the city that holds the class, to its country', () => {
    expect(cameUpFrom({ state: { climbedFrom: '/lu/luxembourg' } }, '/lu/luxembourg/1185')).toBe(
      true,
    )
  })

  it('is false on a fresh arrival or from somewhere else', () => {
    expect(cameUpFrom({ state: null }, '/lu/1185')).toBe(false)
    expect(cameUpFrom({ state: { depth: 1, from: '/' } }, '/lu/1185')).toBe(false)
    expect(cameUpFrom({ state: { climbedFrom: '/lu/lux' } }, '/lu/luxembourg/1185')).toBe(false)
  })
})

describe('climbDestination — Back passes over a place that holds only this class', () => {
  const lib = '/gb/south-east/london/balham-library'
  const classAt = (webPath: string, eventType = 'offline') => ({ webPath, eventType })

  it('skips a venue whose only class is this one, landing on the city', () => {
    const classes = [classAt(`${lib}/717`), classAt('/gb/south-east/london/711')]

    expect(climbDestination(`${lib}/717`, classes)).toBe('/gb/south-east/london')
  })

  it('passes over a venue even with two classes, when the tree says it is a venue', () => {
    const classes = [classAt(`${lib}/717`), classAt(`${lib}/718`)]

    expect(climbDestination(`${lib}/717`, classes, new Set(['balham-library']))).toBe(
      '/gb/south-east/london',
    )
  })

  it('stops at a place with more than one class that is not a venue', () => {
    const classes = [classAt(`${lib}/717`), classAt(`${lib}/718`)]

    expect(climbDestination(`${lib}/717`, classes)).toBe(lib)
  })

  it('climbs past every one-class place, up to the world', () => {
    expect(climbDestination('/lu/luxembourg/1185', [classAt('/lu/luxembourg/1185')])).toBe('/')
  })

  it('keeps a place that also holds an online class', () => {
    const classes = [classAt(`${lib}/717`), classAt(`${lib}/9`, 'online')]

    expect(climbDestination(`${lib}/717`, classes)).toBe(lib)
  })

  it('is the structural parent without the feed', () => {
    expect(climbDestination(`${lib}/717`)).toBe(lib)
  })

  it('names the same place in the Back row on a fresh deep link', () => {
    const classes = [classAt(`${lib}/717`), classAt('/gb/south-east/london/711')]

    expect(backDestination({ pathname: `${lib}/717` }, classes)).toBe('/gb/south-east/london')
  })
})

describe('climbedUpFrom — only a structural climb climbs on', () => {
  it('reads climbedFrom, not a breadcrumb push', () => {
    expect(climbedUpFrom({ state: { climbedFrom: '/lu/luxembourg' } }, '/lu/luxembourg/1185')).toBe(
      true,
    )
    expect(
      climbedUpFrom({ state: { depth: 1, from: '/lu/luxembourg/1185' } }, '/lu/luxembourg/1185'),
    ).toBe(false)
  })
})

// A place resolves by its last slug, so a typed or old address still opens it. Its real
// address comes from the region tree.
describe('placedPathname', () => {
  const pathOf = (slug: string) =>
    ({ gb: '/gb', 'south-east': '/gb/south-east', london: '/gb/south-east/london' })[slug]

  it('swaps a typed country for the real one, keeping what sits on the place', () => {
    expect(placedPathname('/united-kingdom/south-east/london', pathOf)).toBe(
      '/gb/south-east/london',
    )
    expect(placedPathname('/united-kingdom/south-east/london/711/register', pathOf)).toBe(
      '/gb/south-east/london/711/register',
    )
  })

  it('leaves a real address, or one the tree does not know, as it is', () => {
    expect(placedPathname('/gb/south-east/london', pathOf)).toBe('/gb/south-east/london')
    expect(placedPathname('/narnia/cair-paravel', pathOf)).toBe('/narnia/cair-paravel')
    expect(placedPathname('/united-kingdom/south-east/london')).toBe(
      '/united-kingdom/south-east/london',
    )
    expect(placedPathname('/search', pathOf)).toBe('/search')
  })

  it('names and links the real ancestry above the page, and climbs it', () => {
    expect(
      breadcrumbTrail(placedPathname('/united-kingdom/south-east/london/711', pathOf)).map(
        (entry) => entry.path,
      ),
    ).toEqual(['/gb', '/gb/south-east', '/gb/south-east/london'])
    expect(climbDestination('/united-kingdom/south-east', [], new Set(), pathOf)).toBe('/gb')
    expect(backDestination({ pathname: '/united-kingdom/south-east' }, [], new Set(), pathOf)).toBe(
      '/gb',
    )
  })
})
