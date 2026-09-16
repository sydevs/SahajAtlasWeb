import { describe, it, expect } from 'vitest'

import { allowedLivePreviewPaths, shouldBlockPreviewLink } from './navigation'

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
    expect(allowedLivePreviewPaths('/india/pune/507', 'events')).toEqual([
      '/india/pune/507',
      '/india/pune/507/register',
      '/india/pune/507/share',
    ])
  })

  it('pins a region to its own page only', () => {
    expect(allowedLivePreviewPaths('/india/pune', 'regions')).toEqual(['/india/pune'])
  })
})
