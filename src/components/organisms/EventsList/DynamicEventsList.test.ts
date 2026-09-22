import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// `recommended` weighs an event's spoken language, always an ISO 639-1 base code. `useLocale()`
// offers both shapes, and `locale` is i18next's resolved tag — regional wherever one carries the
// bundle (`pt-BR`, `en-AU`). Passing it matched no event, so the penalty landed on all of them,
// and a uniform factor cancels out of the ordering: `recommended` went language-blind rather
// than visibly wrong (#223).
//
// ⚠ This reads the SOURCE because the defect is in the wiring, which no pure spec can see
// (`docs/testing.md`): both values are in scope at the call site and `sortEvents` cannot tell
// them apart. Mounting the component to assert one argument would need a seeded query client,
// a router and an i18next instance.
//
// Comments are stripped first, so documenting the rule cannot satisfy it — the trap
// `config/responsive.test.ts` hit.
const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'DynamicEventsList.tsx'),
  'utf8',
)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('DynamicEventsList', () => {
  it('sorts against the base language, never the resolved locale', () => {
    const args = source.match(/sortEvents\(([^)]*)\)/)

    // A call this no longer finds is a failure, not an empty pass.
    expect(args).not.toBeNull()
    expect(
      args?.[1]
        .split(',')
        .map((arg) => arg.trim())
        .at(-1),
    ).toBe('languageCode')
  })
})
