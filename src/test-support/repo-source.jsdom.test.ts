// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { readRepoSource } from './repo-source'

/**
 * The reader survives the WEB transform, which `repo-source.ts`'s docblock explains (#302).
 *
 * ⚠ **Resolve `REPO_ROOT` the banned way and this file fails at COLLECTION**, not on an
 * assertion — so an ordinary failing expectation here means something else entirely. Watched
 * both ways. `Widget.theme-root.test.tsx` reads through the reader from jsdom too (#289), but it
 * would not say WHY it died, and it has other reasons to be red.
 */
describe('a repo read from a jsdom spec', () => {
  it('still resolves to a file on disk', () => {
    expect(readRepoSource('vite.config.ts')).toContain('defineConfig')
  })
})
