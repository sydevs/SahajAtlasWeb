import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// ⚠ This reads the SOURCE because the defect is in the wiring, which no pure spec can see
// (`docs/testing.md`): `useLocale()` offers a resolved tag and a base subtag, both `string`, so
// `sortEvents` cannot tell them apart. `href.test.ts` pins its own call sites the same way. What
// the two values MEAN to the ordering is pinned in `sort.test.ts` instead.
//
// Comments are stripped first, so documenting the rule cannot satisfy it — the trap
// `config/responsive.test.ts` hit. Whitespace and a trailing comma go too, so Prettier stays
// free to wrap the call as the argument list grows or shrinks.
const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'DynamicEventsList.tsx'),
  'utf8',
)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')
  .replace(/\s+/g, '')
  .replace(/,\)/g, ')')

describe('DynamicEventsList', () => {
  it('sorts against the base language, never the resolved locale', () => {
    // A call this no longer finds is a failure, not an empty pass.
    expect(source.match(/sortEvents\(/g)).toHaveLength(1)
    expect(source).toContain('sortEvents(events,order,languageCode)')
  })
})
