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

  it('rejects a non-http(s) scheme so a hostile url cannot reach a sink', () => {
    // A `data:`/`javascript:` image url must not flow into <img src> or the
    // OG/JSON-LD metadata — drop it rather than pass it through.
    expect(resolveImageUrl('data:text/html,<script>alert(1)</script>', ORIGIN)).toBeNull()
    expect(resolveImageUrl('javascript:alert(1)', ORIGIN)).toBeNull()
  })

  it('returns null when the origin is empty, instead of throwing', () => {
    // A misconfigured/empty origin must not crash the event read; drop the url so
    // the UI skips it (at most one broken <img>, never a whole-event failure).
    expect(resolveImageUrl('/api/images/file/pic.jpg', '')).toBeNull()
  })

  it('defaults the origin to VITE_SAHAJCLOUD_URL', () => {
    // Env-driven default (loaded from .env in the vitest env) — an absolute URL
    // carrying the relative path, without coupling to a specific origin (a dev
    // `.env.local` may point elsewhere).
    expect(resolveImageUrl('/api/images/file/pic.jpg')).toMatch(
      /^https?:\/\/.*\/api\/images\/file\/pic\.jpg$/,
    )
  })
})
