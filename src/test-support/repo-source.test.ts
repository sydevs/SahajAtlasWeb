import { describe, expect, it } from 'vitest'

import { readRepoSource } from './repo-source'

/**
 * ⚠ The contract is that a path is REPO-relative, where `readSource`'s is `src`-relative. The two
 * take the same shape of argument and differ only in what it is relative to, so both assertions
 * below state the root by a path the other reader cannot reach.
 *
 * Its jsdom half is `repo-source.jsdom.test.ts` — the property this module exists for.
 */
describe('the repo-root reader', () => {
  it('resolves a path against the repo root', () => {
    expect(JSON.parse(readRepoSource('package.json')).name).toBe('sahaj-atlas')
  })

  it('refuses a `src`-relative path, so a reader swapped for the other one fails loudly', () => {
    expect(() => readRepoSource('test-support/repo-source.ts')).toThrow(/ENOENT/)
  })
})
