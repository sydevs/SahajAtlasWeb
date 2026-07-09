import { describe, it, expect } from 'vitest'

import { childRoute, isCanonicalPath, parentOf, resolvePath, resolveStack, safePath } from './path'

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

  it('skips legacy prefixes so a legacy URL is just its terminal entity', () => {
    expect(resolveStack('/events/507')).toEqual([{ kind: 'event', id: 507, path: '/events/507' }])
    expect(resolveStack('/areas/antwerpen')).toEqual([
      { kind: 'region', slug: 'antwerpen', path: '/areas/antwerpen' },
    ])
  })

  it('decodes a region slug but keeps the path encoded (matches the address bar)', () => {
    expect(resolveStack('/belgium/li%C3%A8ge')).toEqual([
      { kind: 'region', slug: 'belgium', path: '/belgium' },
      { kind: 'region', slug: 'liège', path: '/belgium/li%C3%A8ge' },
    ])
  })
})
