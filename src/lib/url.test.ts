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
  // "known residue" note on `shareableUrl`. Since #154 the widget's route is a query
  // parameter on the host's own URL, so the two halves of this string are the host's
  // permalink and our route, and only the first is theirs.
  const EMBEDDED_QUERY =
    'https://host.example/?p=123&mc_eid=abc&atlas=/united-kingdom/cambridge/101'

  it('prefers the canonical URL in every mode', () => {
    // Not a fallback order — the event's own public page unfurls and outlives the
    // session, so it wins even where the widget's own URL would have worked.
    expect(shareableUrl(CANONICAL, STANDALONE)).toBe(CANONICAL)
    expect(shareableUrl(CANONICAL, EMBEDDED_QUERY)).toBe(CANONICAL)
    expect(shareableUrl(CANONICAL, undefined)).toBe(CANONICAL)
  })

  // The load-bearing no-regression check: with no canonical, the event's own widget URL is
  // what gets handed out.
  it("falls back to the event's own widget URL", () => {
    expect(shareableUrl(null, STANDALONE)).toBe(STANDALONE)
    // Host query and all — see the "known residue" note on `shareableUrl`. If this ever
    // becomes `origin + pathname + our param`, that was a deliberate decision and this is
    // the assertion it has to change.
    expect(shareableUrl(null, EMBEDDED_QUERY)).toBe(EMBEDDED_QUERY)
  })

  // Memory mode reaches this as `undefined`, because `useShareUrl` has no resolver to call.
  // The distinction that matters: offering the host page's own URL would name their article
  // and nothing about the meditation.
  it('offers nothing when there is no route URL and no canonical', () => {
    expect(shareableUrl(null, undefined)).toBeUndefined()
    expect(shareableUrl(undefined, undefined)).toBeUndefined()
  })

  it('rejects a non-http(s) candidate on either side', () => {
    // A `file://` document is linkable in the routing sense and useless as a share
    // target; a CMS value that slipped the schema must not reach a share intent.
    expect(shareableUrl(null, 'file:///Users/x/demo.html')).toBeUndefined()
    expect(shareableUrl('javascript:alert(1)', STANDALONE)).toBe(STANDALONE)
    expect(shareableUrl('javascript:alert(1)', undefined)).toBeUndefined()
  })
})
