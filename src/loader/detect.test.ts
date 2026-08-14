import type { DetectionSignals } from './detect'

import { describe, expect, it } from 'vitest'

import { fingerprint, fingerprintChanged } from './detect'

/** Every signal true — the ordinary top-level script embed. */
const ideal: DetectionSignals = {
  topLevel: true,
  urlWritable: true,
  paramPersisted: true,
  mountMatches: true,
}

describe('fingerprint', () => {
  it('calls a top-level embed a component and a framed one an iframe', () => {
    expect(fingerprint(ideal, 'query').mode).toBe('component')
    expect(fingerprint({ ...ideal, topLevel: false }, 'query').mode).toBe('iframe')
  })

  it('carries the signals through unchanged, so a report says what was measured', () => {
    expect(fingerprint(ideal, 'path')).toMatchObject(ideal)
  })

  describe('canonicalViable', () => {
    it('holds when a top-level embed can write a route that survives', () => {
      expect(fingerprint(ideal, 'query').canonicalViable).toBe(true)
      expect(fingerprint(ideal, 'path').canonicalViable).toBe(true)
    })

    // The distinction the whole field exists for: a cross-origin frame renders perfectly well
    // and is still worthless as a canonical, because the indexable document is the host's, we
    // cannot write its head, and the `?atlas=` on its URL never reaches us.
    it('is false in a frame even when everything else works', () => {
      expect(fingerprint({ ...ideal, topLevel: false }, 'query').canonicalViable).toBe(false)
    })

    it('is false when the URL cannot be written at all', () => {
      expect(fingerprint({ ...ideal, urlWritable: false }, 'query').canonicalViable).toBe(false)
    })

    // The two routing modes fail differently, so they are asked different questions.
    it('asks query routing whether the param survived the host router', () => {
      expect(fingerprint({ ...ideal, paramPersisted: false }, 'query').canonicalViable).toBe(false)
    })

    it('does not ask path routing about the param, which it never uses', () => {
      expect(fingerprint({ ...ideal, paramPersisted: false }, 'path').canonicalViable).toBe(true)
    })

    it('asks path routing whether we are actually under the mount prefix', () => {
      expect(fingerprint({ ...ideal, mountMatches: false }, 'path').canonicalViable).toBe(false)
    })

    it('does not ask query routing about the mount prefix, which it never uses', () => {
      expect(fingerprint({ ...ideal, mountMatches: false }, 'query').canonicalViable).toBe(true)
    })
  })
})

describe('fingerprintChanged', () => {
  const current = fingerprint(ideal, 'query')

  it('reports a change when the server has never heard from this mount', () => {
    expect(fingerprintChanged(current, null)).toBe(true)
    expect(fingerprintChanged(current, undefined)).toBe(true)
  })

  it('reports no change against an identical record — the steady state is zero writes', () => {
    expect(fingerprintChanged(current, { ...current })).toBe(false)
  })

  it.each([
    ['mode', { mode: 'iframe' as const }],
    ['routing', { routing: 'path' as const }],
    ['topLevel', { topLevel: false }],
    ['urlWritable', { urlWritable: false }],
    ['paramPersisted', { paramPersisted: false }],
    ['mountMatches', { mountMatches: false }],
    ['canonicalViable', { canonicalViable: false }],
  ])('reports a change when %s differs', (_field, diff) => {
    expect(fingerprintChanged(current, { ...current, ...diff })).toBe(true)
  })

  // Including a timestamp in the comparison would make every single page view a "change", which
  // is precisely the write storm the differs-only rule exists to prevent.
  it('ignores fields it was not given, so a stored timestamp cannot force a write', () => {
    const stored = { ...current, lastSeen: '2026-01-01T00:00:00.000Z' } as typeof current

    expect(fingerprintChanged(current, stored)).toBe(false)
  })
})
