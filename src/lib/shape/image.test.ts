import { describe, it, expect } from 'vitest'

import { resolveImageUrl } from './image'

const ORIGIN = 'https://cloud.sydevelopers.com'

describe('resolveImageUrl', () => {
  it('prefixes a relative dev URL with the SahajCloud origin', () => {
    expect(resolveImageUrl('/api/images/file/pic.jpg', ORIGIN)).toBe(
      'https://cloud.sydevelopers.com/api/images/file/pic.jpg',
    )
  })

  it('leaves an already-absolute CDN URL unchanged', () => {
    const cdn = 'https://imagedelivery.net/abc123/pic.jpg/public'

    expect(resolveImageUrl(cdn, ORIGIN)).toBe(cdn)
  })

  it('defaults the origin to VITE_SAHAJCLOUD_URL', () => {
    // Env-driven default (loaded from .env in the vitest env) — assert it yields
    // an absolute URL carrying the relative path, without coupling to a specific
    // origin (a dev `.env.local` may point elsewhere).
    const resolved = resolveImageUrl('/api/images/file/pic.jpg')

    expect(resolved).toMatch(/^https?:\/\//)
    expect(resolved.endsWith('/api/images/file/pic.jpg')).toBe(true)
  })
})
