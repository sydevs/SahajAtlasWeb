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

    it('is false when the written param did not survive the host router', () => {
      expect(fingerprint({ ...ideal, paramPersisted: false }, 'query').canonicalViable).toBe(false)
    })

    /**
     * `routing` arrives on the host's own script URL, so exempting `path` from the
     * `paramPersisted` requirement made the one judgement in this payload settable by the page
     * being judged — and for a mount that query-routes anyway, since `mountDecision` does not
     * honour `path`. Nothing server-side could contradict it either: the endpoint stores no
     * `canonicalViable`. Every input to this field is now something the widget measured.
     */
    it('cannot be turned on by asking for a routing mode', () => {
      const eaten = { ...ideal, paramPersisted: false }

      expect(fingerprint(eaten, 'path').canonicalViable).toBe(false)
      expect(fingerprint(eaten, 'path').canonicalViable).toBe(
        fingerprint(eaten, 'query').canonicalViable,
      )
    })
  })
})
