import { describe, it, expect } from 'vitest'

import privacy, { attributeEnabled } from './privacy'

// The host-facing opt-outs for the third-party data flows (issues #95, #108). All are
// read non-reactively at their call sites (the Fathom block in App.tsx, `useIpLocation`,
// `captureError` in lib/report.ts), so what this can pin is the contract everything else
// depends on: the default, and how an attribute string becomes a boolean.

describe('privacy defaults', () => {
  // Deliberately exhaustive rather than a per-key check: adding a flow means adding an
  // attribute a host can decline and a README row telling them it exists, and a test that
  // only looked at the keys it knew about would let a new one ship unannounced.
  it('leaves every flow enabled for an embed that declares nothing', () => {
    expect(privacy).toEqual({ analytics: true, ipLookup: true, errorReporting: true })
  })
})

// One reader for `map`, `analytics`, `geolocation` and `error-reporting`, so an attribute
// nobody set — or set to anything affirmative — can never silently disable a flow the host
// relies on.
describe('attributeEnabled', () => {
  it.each([
    ['false', false],
    ['0', false],
    [undefined, true],
    ['', true],
    ['true', true],
  ])('%s → %s', (value, expected) => {
    expect(attributeEnabled(value)).toBe(expected)
  })
})
