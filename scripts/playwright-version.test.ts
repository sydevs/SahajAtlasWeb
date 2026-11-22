import { execFileSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

import {
  SCRIPT,
  pinnedPlaywrightVersion,
  readPinnedPlaywrightVersion,
} from './playwright-version.mjs'

/**
 * One row per refusal point in the pattern: a leading non-digit, the segment count, trailing
 * junk, an absent pin.
 */
const REFUSED: [string, Record<string, string>][] = [
  ['a caret range, which names no one browser build', { playwright: '^1.65.1' }],
  ['a two-part version', { playwright: '1.65' }],
  ['a dist-tag', { playwright: 'latest' }],
  ['a newline, which forges a second step output', { playwright: '1.65.1\nreason=publish' }],
  ['no pin at all', {}],
]

describe('pinnedPlaywrightVersion', () => {
  it('reads the exact pin every Chromium cache key is built from', () => {
    expect(pinnedPlaywrightVersion({ playwright: '1.65.1' })).toBe('1.65.1')
  })

  it.each(REFUSED)('refuses %s', (_what, devDependencies) => {
    expect(() => pinnedPlaywrightVersion(devDependencies)).toThrow(/unexpected playwright version/)
  })
})

// The live pin, through the real file read the workflows make: a range entered in `package.json`
// fails here in seconds instead of as a red required check.
describe('readPinnedPlaywrightVersion', () => {
  it('accepts this repository’s own pin', () => {
    expect(() => readPinnedPlaywrightVersion()).not.toThrow()
  })

  // ⚠ Run as a command, because nothing else covers the step output itself. A guard that stopped
  // firing would write nothing and still exit 0, and all three keys would degrade to the same
  // `playwright-chromium-<os>-` at once — so the cache would keep hitting while it tracked no
  // version at all, with nothing red (`docs/testing.md`, #132's lesson).
  it('prints the step output the workflows append to `GITHUB_OUTPUT`', () => {
    const printed = execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8' })

    expect(printed).toMatch(/^version=\d+\.\d+\.\d+\n$/)
    expect(printed).toBe(`version=${readPinnedPlaywrightVersion()}\n`)
  })
})
