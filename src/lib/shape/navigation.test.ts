import { describe, it, expect } from 'vitest'

import { placePathsOf } from './path'
import {
  atlasDepth,
  atlasPushState,
  backStep,
  clearsBackToPlace,
  climbDestination,
  loneClassExit,
  pageRegion,
  passablePlaces,
  sameRoute,
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
    const at = { pathname: '/gb', search: '' }

    expect(atlasPushState({ ...at, state: null })).toMatchObject({ depth: 1 }) // fresh entry
    expect(atlasPushState({ ...at, state: { depth: 2 } })).toMatchObject({ depth: 3 })
  })

  it('records where the push left, query included, so Back can name it', () => {
    expect(atlasPushState({ state: null, pathname: '/search', search: '?q=Prague' })).toEqual({
      depth: 1,
      from: '/search?q=Prague',
    })
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

describe('backStep', () => {
  it('is nothing at the root', () => {
    expect(backStep({ pathname: '/' })).toBeUndefined()
  })

  it('steps back to the entry the push left, query included', () => {
    expect(
      backStep({ pathname: '/gb/712', state: { depth: 1, from: '/search?q=Prague' } }),
    ).toEqual({ to: '/search?q=Prague', how: 'history' })
  })

  it('climbs on a fresh deep link, even with a stale `from`', () => {
    // Never a history step at depth 0: the embedded widget shares history with the host page.
    expect(backStep({ pathname: '/gb/712', state: { from: '/search' } })).toEqual({
      to: '/gb',
      how: 'climb',
    })
  })

  it('climbs, rather than stepping back blind, from an entry stamped with no `from`', () => {
    expect(backStep({ pathname: '/gb/712', state: { depth: 2 } })).toEqual({
      to: '/gb',
      how: 'climb',
    })
  })

  it('keeps the search query when climbing back into the results', () => {
    expect(backStep({ pathname: '/search/42', search: '?q=Prague' })).toEqual({
      to: '/search?q=Prague',
      how: 'climb',
    })
  })
})

describe('backStep — closing the filters', () => {
  it('steps back onto the search it opened over, with the answers now in the URL', () => {
    expect(
      backStep({
        pathname: '/search/filters',
        search: '?q=Prague&days=2',
        state: { depth: 2, from: '/search?q=Prague' },
      }),
    ).toEqual({ to: '/search?q=Prague&days=2', how: 'history' })
  })

  it('opens the results scoped to the region it was opened over, replacing its own entry', () => {
    expect(
      backStep({ pathname: '/gb/filters', search: '?days=2', state: { depth: 1, from: '/gb' } }),
    ).toEqual({ to: '/search?days=2&region=gb', how: 'replace' })
  })

  it('keeps a fresh link on the widget: the results replace it, never a step back', () => {
    expect(backStep({ pathname: '/gb/filters', search: '?days=2' })).toEqual({
      to: '/search?days=2&region=gb',
      how: 'replace',
    })
    expect(backStep({ pathname: '/calendar/filters', search: '?days=2' })).toEqual({
      to: '/calendar?days=2',
      how: 'replace',
    })
  })

  it('closes like any view with nothing answered', () => {
    expect(backStep({ pathname: '/gb/filters', state: { depth: 1, from: '/gb' } })).toEqual({
      to: '/gb',
      how: 'history',
    })
    expect(backStep({ pathname: '/gb/filters' })).toEqual({ to: '/gb', how: 'climb' })
    expect(backStep({ pathname: '/filters' })).toEqual({ to: '/', how: 'climb' })
  })

  it('says the cleared query it lands on, so a step back does not restore the old answers', () => {
    expect(backStep({ pathname: '/gb/filters', state: { depth: 1, from: '/gb?days=2' } })).toEqual({
      to: '/gb',
      how: 'history',
    })
  })

  it('returns to the calendar the overlay covers, query kept', () => {
    expect(
      backStep({
        pathname: '/calendar/filters',
        search: '?time=evening',
        state: { depth: 2, from: '/calendar' },
      }),
    ).toEqual({ to: '/calendar?time=evening', how: 'history' })
  })
})

describe('sameRoute', () => {
  it('ignores the order of query parameters, and nothing else', () => {
    expect(sameRoute('/search?a=1&b=2', '/search?b=2&a=1')).toBe(true)
    expect(sameRoute('/search?a=1', '/search')).toBe(false)
    expect(sameRoute('/gb', '/gb?')).toBe(true)
  })
})

describe('loneClassExit', () => {
  it('tells a climb out of the class from a step back out of it, query ignored', () => {
    expect(loneClassExit({ state: { climbedFrom: '/lu/1185' } }, '/lu/1185')).toBe('climbed')
    expect(loneClassExit({ state: { depth: 1, from: '/lu/1185?locale=fr' } }, '/lu/1185')).toBe(
      'back',
    )
  })

  it('reads a climb two levels up: from the city that holds the class, to its country', () => {
    expect(loneClassExit({ state: { climbedFrom: '/lu/luxembourg' } }, '/lu/luxembourg/1185')).toBe(
      'climbed',
    )
  })

  it('reads a page stacked on the class, and the class at its other address', () => {
    expect(loneClassExit({ state: { depth: 2, from: '/lu/1185/register' } }, '/lu/1185')).toBe(
      'back',
    )
    expect(loneClassExit({ state: { climbedFrom: '/lu/luxembourg/hall/1185' } }, '/lu/1185')).toBe(
      'climbed',
    )
  })

  it('is an arrival after a push from a place above', () => {
    expect(
      loneClassExit({ state: { depth: 1, from: '/lu' } }, '/lu/luxembourg/1185'),
    ).toBeUndefined()
  })

  it('is an arrival on a fresh deep link or from somewhere else', () => {
    expect(loneClassExit({ state: null }, '/lu/1185')).toBeUndefined()
    expect(loneClassExit({ state: { depth: 1, from: '/' } }, '/lu/1185')).toBeUndefined()
    expect(
      loneClassExit({ state: { climbedFrom: '/lu/lux' } }, '/lu/luxembourg/1185'),
    ).toBeUndefined()
  })

  it('prefers the climb when a location carries both stamps', () => {
    expect(
      loneClassExit({ state: { depth: 1, climbedFrom: '/lu/1185', from: '/lu' } }, '/lu/1185'),
    ).toBe('climbed')
  })
})

describe('pageRegion', () => {
  it('names the place a place page shows, and nothing off one', () => {
    expect(pageRegion('/gb')).toBe('gb')
    expect(pageRegion('/gb/south-east/london')).toBe('london')
    expect(pageRegion('/search')).toBeNull()
    expect(pageRegion('/')).toBeNull()
  })
})

describe('clearsBackToPlace', () => {
  // The results an answer on /gb opened: one push deep, stamped from the place page.
  const opened = {
    pathname: '/search',
    search: '?days=2&region=gb',
    state: { depth: 1, from: '/gb' },
  }

  it('goes back to the place page the results were opened from', () => {
    expect(clearsBackToPlace(opened, 'gb')).toBe(true)
  })

  it('only clears on a fresh link, which has no page to go back to', () => {
    expect(clearsBackToPlace({ ...opened, state: null }, 'gb')).toBe(false)
  })

  it('only clears once a place was searched since', () => {
    expect(clearsBackToPlace({ ...opened, search: '?days=2&center=51.5,-0.1' }, 'gb')).toBe(false)
  })

  it('only clears when the place in scope is no longer the page it came from', () => {
    expect(clearsBackToPlace(opened, 'fr')).toBe(false)
    expect(
      clearsBackToPlace({ ...opened, state: { depth: 1, from: '/search?days=1' } }, 'gb'),
    ).toBe(false)
  })

  it('only applies to the results', () => {
    expect(clearsBackToPlace({ ...opened, pathname: '/calendar' }, 'gb')).toBe(false)
  })
})
