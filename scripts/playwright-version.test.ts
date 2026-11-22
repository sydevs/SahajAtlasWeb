import { describe, expect, it } from 'vitest'

import { pinnedPlaywrightVersion } from './playwright-version.mjs'
import { readPackage } from './_wrangler-config.mjs'

/** Each refusal, and the reason an unvalidated read would have published it as a step output. */
const REFUSED: [string, Record<string, string>][] = [
  ['a caret range, which names no one browser build', { playwright: '^1.65.1' }],
  ['a tilde range', { playwright: '~1.65.1' }],
  ['a two-part version', { playwright: '1.65' }],
  ['a dist-tag', { playwright: 'latest' }],
  ['a newline, which forges a second step output', { playwright: '1.65.1\nreason=publish' }],
  ['trailing whitespace, which a cache key would carry', { playwright: '1.65.1 ' }],
  ['no pin at all', {}],
]

describe('pinnedPlaywrightVersion', () => {
  it('reads the exact pin every Chromium cache key is built from', () => {
    expect(pinnedPlaywrightVersion({ playwright: '1.65.1' })).toBe('1.65.1')
  })

  // The live pin, so a range entered here fails in seconds rather than as a cache miss in CI
  // that nothing explains — the key would name a version `browser-cache.yml` never wrote.
  it('accepts this repository’s own pin', () => {
    expect(pinnedPlaywrightVersion(readPackage().devDependencies)).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it.each(REFUSED)('refuses %s', (_what, devDependencies) => {
    expect(() => pinnedPlaywrightVersion(devDependencies)).toThrow(/unexpected playwright version/)
  })
})
