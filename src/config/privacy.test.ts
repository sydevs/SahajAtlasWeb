import { describe, it, expect } from 'vitest'

import privacy, { attributeEnabled } from './privacy'

// The host-facing opt-outs for the two third-party data flows (issue #95). Both are
// read non-reactively at their call sites (the Fathom block in App.tsx, `useIpLocation`),
// so what this can pin is the contract everything else depends on: the default, and how
// an attribute string becomes a boolean.

describe('privacy defaults', () => {
  it('leaves both flows enabled for an embed that declares nothing', () => {
    expect(privacy).toEqual({ analytics: true, ipLookup: true })
  })
})

// One reader for `map`, `analytics` and `geolocation`, so an attribute nobody set — or
// set to anything affirmative — can never silently disable a flow the host relies on.
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
