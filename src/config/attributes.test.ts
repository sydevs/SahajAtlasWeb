import { describe, expect, it } from 'vitest'

import { attributeEnabled } from './attributes'

// This is the one reader for `map`, the last boolean setting left after the privacy opt-outs were removed. See #149.
// Its whole job is this: a value nobody wrote, or wrote affirmatively, can never silently disable a flow the host relies on.
describe('attributeEnabled', () => {
  it.each([
    ['false', false],
    ['0', false],
  ])('%s switches the feature off', (value, expected) => {
    expect(attributeEnabled(value)).toBe(expected)
  })

  // `no` and `off` are the ones an integrator writes by accident, and they deliberately do NOT work.
  // The cost of that surprise is one documented sentence.
  // The cost of honoring them instead would be a rule with fuzzy edges that a typo can fall through.
  it.each([undefined, null, '', 'true', '1', 'no', 'off', 'FALSE', 'False', 'yes'])(
    'leaves the feature on for %j',
    (value) => {
      expect(attributeEnabled(value)).toBe(true)
    },
  )
})
