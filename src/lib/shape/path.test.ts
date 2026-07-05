import { describe, it, expect } from 'vitest'

import { isCanonicalPath, parentOf, resolvePath, safePath } from './path'

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
