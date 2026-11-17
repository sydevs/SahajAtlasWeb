import { describe, expect, it } from 'vitest'

import { FLAG_CDN_URL } from './flag-cdn'

describe('FLAG_CDN_URL', () => {
  it('is an absolute URL ending in /flags/, so a host page never resolves it against its own origin', () => {
    expect(FLAG_CDN_URL).toMatch(/^[a-z]+:\/\/.*\/flags\/$/)
  })

  it('never names a third party', () => {
    expect(FLAG_CDN_URL).not.toContain('pages.dev')
  })
})
