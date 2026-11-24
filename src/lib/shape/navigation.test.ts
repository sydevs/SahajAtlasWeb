import { describe, it, expect } from 'vitest'

import { placePathsOf } from './path'
import {
  atlasDepth,
  atlasPushState,
  backDestination,
  cameUpFrom,
  climbDestination,
  climbedUpFrom,
  dismissAction,
  loneClassPath,
  passablePlaces,
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

  it('records where the push left, query included, so Back can name it', () => {
    expect(atlasPushState({ state: null, pathname: '/search', search: '?q=Prague' })).toEqual({
      depth: 1,
      from: '/search?q=Prague',
    })
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

// A UK slice of the region tree: London holds a venue (Balham Library) with one class and a
// second class of its own; Luxembourg's only city holds one class.
const regions = [
  { id: 1, slug: 'gb', level: 'country', parent: null, webPath: '/gb' },
  { id: 2, slug: 'south-east', level: 'region', parent: 1, webPath: '/gb/south-east' },
  { id: 3, slug: 'london', level: 'city', parent: 2, webPath: '/gb/south-east/london' },
  {
    id: 4,
    slug: 'balham-library',
    level: 'venue',
    parent: 3,
    webPath: '/gb/south-east/london/balham-library',
  },
  { id: 10, slug: 'lu', level: 'country', parent: null, webPath: '/lu' },
  { id: 11, slug: 'luxembourg', level: 'city', parent: 10, webPath: '/lu/luxembourg' },
]
const classes = [
  { region: { id: 4 }, online: false },
  { region: { id: 3 }, online: false },
  { region: { id: 11 }, online: false },
]

describe('passablePlaces', () => {
  it('names venues and places holding a single in-person class', () => {
    expect([...passablePlaces(regions, classes)].sort()).toEqual([
      'balham-library',
      'lu',
      'luxembourg',
    ])
  })

  it('keeps a one-class place that also rolls up an online class', () => {
    expect(
      passablePlaces(regions, [...classes, { region: { id: 11 }, online: true }]),
    ).not.toContain('luxembourg')
  })
})

describe('climbDestination', () => {
  const climb = { passable: passablePlaces(regions, classes), pathOf: placePathsOf(regions) }

  it('goes to the structural parent while nothing is known', () => {
    expect(climbDestination('/gb/south-east/london/balham-library/717')).toBe(
      '/gb/south-east/london/balham-library',
    )
  })

  it('passes over the venue a class sits in: Back to London', () => {
    expect(climbDestination('/gb/south-east/london/balham-library/717', climb)).toBe(
      '/gb/south-east/london',
    )
  })

  it("passes over every one-class place: Luxembourg's lone class goes to the world map", () => {
    expect(climbDestination('/lu/luxembourg/1185', climb)).toBe('/')
  })

  it('climbs the real ancestry of a typed address', () => {
    expect(climbDestination('/united-kingdom/south-east/london', climb)).toBe('/gb/south-east')
  })
})

describe('backDestination', () => {
  it('is nothing at the root', () => {
    expect(backDestination({ pathname: '/' })).toBeUndefined()
  })

  it('names the entry history goes back to, query included', () => {
    expect(
      backDestination({ pathname: '/gb/712', state: { depth: 1, from: '/search?q=Prague' } }),
    ).toBe('/search?q=Prague')
  })

  it('climbs on a fresh deep link, even with a stale `from`', () => {
    expect(backDestination({ pathname: '/gb/712', state: { from: '/search' } })).toBe('/gb')
  })

  it('keeps the search query when climbing back into the results', () => {
    expect(backDestination({ pathname: '/search/filters', search: '?q=Prague' })).toBe(
      '/search?q=Prague',
    )
  })
})

describe('loneClassPath', () => {
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
      loneClassPath(place({ events: [{ path: '/x/1' }], onlineEvents: [{}] }), false),
    ).toBeUndefined()
  })

  it('keeps the page while a filter narrows the list', () => {
    expect(loneClassPath(place({ events: [{ path: '/lu/1185' }] }), true)).toBeUndefined()
  })
})

describe('cameUpFrom', () => {
  it('is true after a climb or a step back from that class, query ignored', () => {
    expect(cameUpFrom({ state: { climbedFrom: '/lu/1185' } }, '/lu/1185')).toBe(true)
    expect(cameUpFrom({ state: { depth: 1, from: '/lu/1185?locale=fr' } }, '/lu/1185')).toBe(true)
  })

  it('is true two levels up: from the city that holds the class, to its country', () => {
    expect(climbedUpFrom({ state: { climbedFrom: '/lu/luxembourg' } }, '/lu/luxembourg/1185')).toBe(
      true,
    )
  })

  it('is false on a fresh arrival or from somewhere else', () => {
    expect(cameUpFrom({ state: null }, '/lu/1185')).toBe(false)
    expect(cameUpFrom({ state: { depth: 1, from: '/' } }, '/lu/1185')).toBe(false)
    expect(cameUpFrom({ state: { climbedFrom: '/lu/lux' } }, '/lu/luxembourg/1185')).toBe(false)
  })
})
