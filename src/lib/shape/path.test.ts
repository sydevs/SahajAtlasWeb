import { describe, it, expect } from 'vitest'

import {
  childRoute,
  isCanonicalPath,
  listResetKey,
  nearestKnownRegion,
  parentOf,
  parseCenter,
  resolvePath,
  resolveStack,
  safePath,
} from './path'

describe('safePath', () => {
  it('accepts a site-relative path', () => {
    expect(safePath('/belgium/flanders')).toBe('/belgium/flanders')
    expect(safePath('/507')).toBe('/507')
  })

  it('rejects scheme, protocol-relative, relative, empty, and nullish', () => {
    expect(safePath('javascript:alert(1)')).toBeUndefined()
    expect(safePath('https://evil.example')).toBeUndefined()
    expect(safePath('//evil.example')).toBeUndefined()
    expect(safePath('belgium')).toBeUndefined()
    expect(safePath('')).toBeUndefined()
    expect(safePath(null)).toBeUndefined()
    expect(safePath(undefined)).toBeUndefined()
  })
})

describe('parentOf', () => {
  it('drops the last segment (region → parent, event → its region page)', () => {
    expect(parentOf('/belgium/flanders')).toBe('/belgium')
    expect(parentOf('/belgium/flanders/antwerpen/downtown-hall/507')).toBe(
      '/belgium/flanders/antwerpen/downtown-hall',
    )
  })

  it('is undefined for a single-segment (top-level) path', () => {
    expect(parentOf('/belgium')).toBeUndefined()
    expect(parentOf('/507')).toBeUndefined()
    expect(parentOf('/')).toBeUndefined()
  })
})

describe('childRoute', () => {
  it('nests a child id/slug under a parent path (inverse of parentOf)', () => {
    expect(childRoute('/belgium/flanders/antwerpen', 507)).toBe('/belgium/flanders/antwerpen/507')
    expect(childRoute('/belgium', 'flanders')).toBe('/belgium/flanders')
    expect(parentOf(childRoute('/india/pune', 507))).toBe('/india/pune')
  })
})

describe('isCanonicalPath', () => {
  it('treats a percent-encoded pathname as equal to its decoded target', () => {
    expect(isCanonicalPath('/belgium/li%C3%A8ge', '/belgium/liège')).toBe(true)
  })

  it('is false when the paths genuinely differ (legacy flat URL)', () => {
    expect(isCanonicalPath('/areas/antwerpen', '/belgium/flanders/antwerpen')).toBe(false)
  })

  it('does not throw on a malformed percent escape', () => {
    expect(isCanonicalPath('/foo%', '/foo%')).toBe(true)
  })
})

describe('resolvePath', () => {
  it('resolves a numeric terminal to an event id at any depth (incl. legacy flat)', () => {
    expect(resolvePath('/507')).toEqual({ kind: 'event', id: 507 })
    expect(resolvePath('/belgium/flanders/antwerpen/downtown-hall/507')).toEqual({
      kind: 'event',
      id: 507,
    })
    expect(resolvePath('/events/507')).toEqual({ kind: 'event', id: 507 })
  })

  it('resolves a non-numeric terminal to a region slug (region- and venue-optional)', () => {
    expect(resolvePath('/belgium')).toEqual({ kind: 'region', slug: 'belgium' })
    expect(resolvePath('/belgium/antwerpen')).toEqual({ kind: 'region', slug: 'antwerpen' })
    expect(resolvePath('/belgium/flanders/antwerpen')).toEqual({
      kind: 'region',
      slug: 'antwerpen',
    })
    expect(resolvePath('/areas/antwerpen')).toEqual({ kind: 'region', slug: 'antwerpen' })
  })

  it('returns null for the root (no region/event segment)', () => {
    expect(resolvePath('/')).toBeNull()
    expect(resolvePath('')).toBeNull()
  })

  it('decodes an encoded terminal slug', () => {
    expect(resolvePath('/belgium/li%C3%A8ge')).toEqual({ kind: 'region', slug: 'liège' })
  })

  it('does not throw on a malformed percent escape', () => {
    expect(resolvePath('/foo%')).toEqual({ kind: 'region', slug: 'foo%' })
  })
})

describe('resolveStack', () => {
  it('is empty for the root (CountriesView is the implicit base)', () => {
    expect(resolveStack('/')).toEqual([])
    expect(resolveStack('')).toEqual([])
  })

  it('returns one entry per segment for a nested region → event path', () => {
    expect(resolveStack('/india/pune/507')).toEqual([
      { kind: 'region', slug: 'india', path: '/india' },
      { kind: 'region', slug: 'pune', path: '/india/pune' },
      { kind: 'event', id: 507, path: '/india/pune/507' },
    ])
  })

  it('appends a register/share entry over the parent event', () => {
    expect(resolveStack('/india/pune/507/register')).toEqual([
      { kind: 'region', slug: 'india', path: '/india' },
      { kind: 'region', slug: 'pune', path: '/india/pune' },
      { kind: 'event', id: 507, path: '/india/pune/507' },
      { kind: 'register', eventPath: '/india/pune/507', path: '/india/pune/507/register' },
    ])
    expect(resolveStack('/507/share').at(-1)).toEqual({
      kind: 'share',
      eventPath: '/507',
      path: '/507/share',
    })
  })

  it('owns /search', () => {
    expect(resolveStack('/search')).toEqual([{ kind: 'search', path: '/search' }])
  })

  it('owns /filters, stacking it over the search view when nested', () => {
    expect(resolveStack('/filters')).toEqual([{ kind: 'filters', path: '/filters' }])
    expect(resolveStack('/search/filters')).toEqual([
      { kind: 'search', path: '/search' },
      { kind: 'filters', path: '/search/filters' },
    ])
  })

  it('owns /…/online, carrying the parent region slug', () => {
    expect(resolveStack('/canada/ontario/online')).toEqual([
      { kind: 'region', slug: 'canada', path: '/canada' },
      { kind: 'region', slug: 'ontario', path: '/canada/ontario' },
      { kind: 'online', regionSlug: 'ontario', path: '/canada/ontario/online' },
    ])
    // An event opened from the online drawer nests under it.
    expect(resolveStack('/canada/ontario/online/507').at(-1)).toEqual({
      kind: 'event',
      id: 507,
      path: '/canada/ontario/online/507',
    })
  })

  it('skips legacy prefixes so a legacy URL is just its terminal entity', () => {
    expect(resolveStack('/events/507')).toEqual([{ kind: 'event', id: 507, path: '/events/507' }])
    expect(resolveStack('/areas/antwerpen')).toEqual([
      { kind: 'region', slug: 'antwerpen', path: '/areas/antwerpen' },
    ])
  })

  it('skips the /preview boot route (no drawer — PreviewController navigates on)', () => {
    expect(resolveStack('/preview')).toEqual([])
  })

  it('decodes a region slug but keeps the path encoded (matches the address bar)', () => {
    expect(resolveStack('/belgium/li%C3%A8ge')).toEqual([
      { kind: 'region', slug: 'belgium', path: '/belgium' },
      { kind: 'region', slug: 'liège', path: '/belgium/li%C3%A8ge' },
    ])
  })
})

describe('parseCenter', () => {
  it('decodes a `lng,lat` pair', () => {
    expect(parseCenter('-0.1276,51.5072')).toEqual([-0.1276, 51.5072])
  })

  it('rejects anything that is not two finite numbers', () => {
    expect(parseCenter(null)).toBeUndefined()
    expect(parseCenter('')).toBeUndefined()
    expect(parseCenter('here')).toBeUndefined()
    expect(parseCenter('1')).toBeUndefined()
  })

  it('rejects out-of-range coordinates rather than handing them to Mapbox', () => {
    // `LngLat` throws outside ±90 latitude, and this value reaches `flyTo` straight
    // from the URL — so a crafted `?center` would take the whole widget down to the
    // error boundary inside somebody else's page.
    expect(parseCenter('0,1000')).toBeUndefined()
    expect(parseCenter('0,-91')).toBeUndefined()
    expect(parseCenter('181,0')).toBeUndefined()
    // The extremes themselves are legitimate.
    expect(parseCenter('180,90')).toEqual([180, 90])
    expect(parseCenter('-180,-90')).toEqual([-180, -90])
  })
})

describe('nearestKnownRegion', () => {
  // The region tree a viewer's session has cached. `atlantis` and the dead venue are
  // deliberately absent — those are the slugs that 404'd in the first place.
  const known = new Set(['gb', 'cambridgeshire', 'india', 'fr', 'nouvelle-aquitaine'])

  it('drops the failing terminal before walking — that entry IS what threw', () => {
    // /gb/cambridgeshire/atlantis 404s on `atlantis`; offering it back would repeat the
    // failure, so the walk starts one above it.
    expect(nearestKnownRegion('/gb/cambridgeshire/atlantis', known)).toBe('cambridgeshire')
  })

  it("steps over a register/share segment to the event's region", () => {
    // The load-bearing case: `parentOf` here yields the dead event path, so a parent-based
    // recovery would hand the viewer a second dead link.
    expect(nearestKnownRegion('/gb/cambridgeshire/999999/register', known)).toBe('cambridgeshire')
    expect(nearestKnownRegion('/gb/cambridgeshire/999999/share', known)).toBe('cambridgeshire')
    expect(nearestKnownRegion('/india/register', known)).toBe('india')
  })

  it('steps over slugs the tree no longer carries', () => {
    // A renamed venue between the country and the event — skipped, not offered.
    expect(nearestKnownRegion('/gb/renamed-venue/999999', known)).toBe('gb')
  })

  it('returns undefined when nothing in the chain resolves', () => {
    expect(nearestKnownRegion('/999999', known)).toBeUndefined()
    expect(nearestKnownRegion('/atlantis', known)).toBeUndefined()
    expect(nearestKnownRegion('/', known)).toBeUndefined()
    expect(nearestKnownRegion('/unknown-a/unknown-b', known)).toBeUndefined()
  })

  it('never throws, whatever the path or the set', () => {
    // Runs inside an error fallback, where a throw blanks the widget on a host page.
    for (const path of ['', '//', '/%E0%A4%A', '/a/'.repeat(200)]) {
      expect(() => nearestKnownRegion(path, known)).not.toThrow()
    }

    expect(nearestKnownRegion('/gb/cambridgeshire/atlantis', new Set())).toBeUndefined()
  })
})

describe('listResetKey', () => {
  const key = (search: string) => listResetKey(new URLSearchParams(search))

  it('ignores ?q — the geocoder rewrites it on every keystroke', () => {
    // The reason this helper exists: keying the results boundary on the raw query string
    // would retry a failing query once per character typed.
    expect(key('center=0,0&q=Cam')).toBe(key('center=0,0&q=Cambridge'))
    expect(key('center=0,0&q=Cam')).toBe(key('center=0,0'))
  })

  it('changes when what is actually queried changes', () => {
    const base = key('center=0,0')

    expect(key('center=4.35,50.85')).not.toBe(base) // a new place
    expect(key('center=0,0&format=online')).not.toBe(base) // a filter
    expect(key('center=0,0&all=1')).not.toBe(base) // the distance cap dismissed
    expect(key('center=0,0&cc=GB')).not.toBe(base) // the searched country
  })

  it('is order-independent, so param reshuffling is not a reset', () => {
    expect(key('center=0,0&format=online')).toBe(key('format=online&center=0,0'))
  })

  it('handles the bare search with no params', () => {
    expect(key('')).toBe('')
    expect(key('q=anything')).toBe('')
  })
})
