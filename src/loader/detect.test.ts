import type { DetectionSignals } from './detect'

import { describe, expect, it } from 'vitest'

import { fingerprint } from './detect'

/** Every signal true — the ordinary top-level script embed. */
const ideal: DetectionSignals = {
  topLevel: true,
  urlWritable: true,
  paramPersisted: true,
}

describe('fingerprint', () => {
  it('calls a top-level embed inline and a framed one an iframe', () => {
    expect(fingerprint(ideal, 'query').mode).toBe('inline')
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

    // Path routing never uses the param, and the thing it DOES need — the host's server serving
    // the widget's routes under a prefix — is not observable from the client, so this reports
    // what the page can support rather than claiming to have verified more.
    it('does not ask path routing about the param, which it never uses', () => {
      expect(fingerprint({ ...ideal, paramPersisted: false }, 'path').canonicalViable).toBe(true)
    })
  })
})
