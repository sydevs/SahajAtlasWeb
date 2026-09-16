import { describe, it, expect } from 'vitest'

import {
  allowedLivePreviewPaths,
  resolveLivePreviewTarget,
  shouldBlockPreviewLink,
} from './navigation'

describe('shouldBlockPreviewLink', () => {
  it('blocks internal routes, external, mailto, and tel links', () => {
    expect(shouldBlockPreviewLink('/india/pune')).toBe(true)
    expect(shouldBlockPreviewLink('/507')).toBe(true)
    expect(shouldBlockPreviewLink('https://example.com')).toBe(true)
    expect(shouldBlockPreviewLink('mailto:a@b.com')).toBe(true)
    expect(shouldBlockPreviewLink('tel:+123')).toBe(true)
  })

  it('allows same-page hash links (scroll) and ignores missing/empty hrefs', () => {
    expect(shouldBlockPreviewLink('#section')).toBe(false)
    expect(shouldBlockPreviewLink('#')).toBe(false)
    expect(shouldBlockPreviewLink(null)).toBe(false)
    expect(shouldBlockPreviewLink(undefined)).toBe(false)
    expect(shouldBlockPreviewLink('')).toBe(false)
  })
})

describe('allowedLivePreviewPaths', () => {
  it('lets an event stay on its page plus register/share', () => {
    expect(allowedLivePreviewPaths('/india/pune/507', 'event')).toEqual([
      '/india/pune/507',
      '/india/pune/507/register',
      '/india/pune/507/share',
    ])
  })

  it('pins a region to its own page only', () => {
    expect(allowedLivePreviewPaths('/india/pune', 'region')).toEqual(['/india/pune'])
  })
})

describe('resolveLivePreviewTarget', () => {
  it('reads an event id off the terminal segment', () => {
    expect(resolveLivePreviewTarget('/india/pune/507')).toEqual({ kind: 'event', id: 507 })
  })

  it('reads a region slug off the terminal segment, decoded', () => {
    expect(resolveLivePreviewTarget('/belgium/li%C3%A8ge')).toEqual({
      kind: 'region',
      slug: 'liège',
    })
  })

  it('names no document on /preview', () => {
    // The boot route for `event-submissions`. `resolvePath` on its own would read `preview` as
    // a region slug and the controller would try to render a region that does not exist.
    expect(resolveLivePreviewTarget('/preview')).toBeNull()
  })

  it('names no document on a routed word, only on a real one', () => {
    expect(resolveLivePreviewTarget('/india/pune/507/register')).toBeNull()
    expect(resolveLivePreviewTarget('/india/pune/507/share')).toBeNull()
    expect(resolveLivePreviewTarget('/search')).toBeNull()
    expect(resolveLivePreviewTarget('/')).toBeNull()
  })
})
