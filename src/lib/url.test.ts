import { describe, it, expect } from 'vitest'

import { shareableUrl, validateWebUrl } from './url'

describe('validateWebUrl', () => {
  it('returns http(s) absolute URLs unchanged', () => {
    expect(validateWebUrl('https://atlas.example/belgium')).toBe('https://atlas.example/belgium')
    expect(validateWebUrl('http://x.test')).toBe('http://x.test')
  })

  it('rejects non-http(s), relative, empty, and nullish', () => {
    expect(validateWebUrl('javascript:alert(1)')).toBeUndefined()
    expect(validateWebUrl('/belgium/flanders')).toBeUndefined()
    expect(validateWebUrl('')).toBeUndefined()
    expect(validateWebUrl(null)).toBeUndefined()
    expect(validateWebUrl(undefined)).toBeUndefined()
  })
})

describe('shareableUrl', () => {
  const CANONICAL = 'https://wemeditate.example/uk/cambridge/monday-meditation'
  // What `window.location.href` reads in each of the three modes the widget runs in.
  const STANDALONE = 'https://sahajatlas.example/united-kingdom/cambridge/101'
  // Carries a host query on purpose: everything before the `#` belongs to the host page,
  // and this fixture is what makes it visible that we hand it on unchanged. See the
  // "known residue" note on `shareableUrl` — the fragment is the widget's whole route, so
  // the two halves of this string cannot be treated the same way.
  const EMBEDDED_HASH = 'https://host.example/?p=123&mc_eid=abc#/!/united-kingdom/cambridge/101'
  const EMBEDDED_MEMORY = 'https://host.example/blog/post#respond'

  it('prefers the canonical URL in every mode', () => {
    // Not a fallback order — the event's own public page unfurls and outlives the
    // session, so it wins even where the address bar would have worked.
    expect(shareableUrl(CANONICAL, STANDALONE, true)).toBe(CANONICAL)
    expect(shareableUrl(CANONICAL, EMBEDDED_HASH, true)).toBe(CANONICAL)
    expect(shareableUrl(CANONICAL, EMBEDDED_MEMORY, false)).toBe(CANONICAL)
  })

  // The load-bearing no-regression check: both working modes keep handing out the
  // identifying URL they always have when the event has no canonical.
  it('falls back to the address bar in the two linkable modes', () => {
    expect(shareableUrl(null, STANDALONE, true)).toBe(STANDALONE)
    // Host query and all — see the "known residue" note on `shareableUrl`. If this ever
    // becomes `origin + pathname + hash`, that was a deliberate decision and this is the
    // assertion it has to change.
    expect(shareableUrl(null, EMBEDDED_HASH, true)).toBe(EMBEDDED_HASH)
  })

  it('offers nothing in memory mode when the event has no canonical', () => {
    // The host page's own anchor identifies their comment form, not the meditation.
    expect(shareableUrl(null, EMBEDDED_MEMORY, false)).toBeUndefined()
    expect(shareableUrl(undefined, EMBEDDED_MEMORY, false)).toBeUndefined()
  })

  it('rejects a non-http(s) candidate on either side', () => {
    // A `file://` document is linkable in the routing sense and useless as a share
    // target; a CMS value that slipped the schema must not reach a share intent.
    expect(shareableUrl(null, 'file:///Users/x/demo.html', true)).toBeUndefined()
    expect(shareableUrl('javascript:alert(1)', STANDALONE, true)).toBe(STANDALONE)
    expect(shareableUrl('javascript:alert(1)', EMBEDDED_MEMORY, false)).toBeUndefined()
  })
})
