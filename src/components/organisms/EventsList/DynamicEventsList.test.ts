import { describe, expect, it } from 'vitest'

import { readRepoSource } from '@/test-support/repo-source'

// ⚠ This reads the SOURCE because the defect is in the wiring, which no pure spec can see
// (`docs/testing.md`): `useLocale()` offers a resolved tag and a base subtag, both `string`, so
// `sortEvents` cannot tell them apart. `href.test.ts` pins its own call sites the same way. What
// the two values MEAN to the ordering is pinned in `sort.test.ts` instead.
//
// Comments are stripped first, so documenting the rule cannot satisfy it — the trap
// `config/responsive.test.ts` hit. Whitespace and a trailing comma go too, so Prettier stays
// free to wrap the call as the argument list grows or shrinks.
const source = readRepoSource('src/components/organisms/EventsList/DynamicEventsList.tsx')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')
  .replace(/\s+/g, '')
  .replace(/,\)/g, ')')

describe('DynamicEventsList', () => {
  // Two calls: the undivided list, and each group of a searched place.
  it('sorts against the base language, never the resolved locale', () => {
    // A call this no longer finds is a failure, not an empty pass.
    expect(source.match(/sortEvents\(/g)).toHaveLength(2)
    expect(source.match(/sortEvents\(\w+,order,languageCode[,)]/g)).toHaveLength(2)
  })

  // The groups of a searched place follow the visitor's order inside them, measured as each group
  // was measured: an order applied before the split would be undone by it (Devindra, 12 Nov).
  it('orders a searched place within its groups, by the distance each group measures', () => {
    expect(source).toContain(
      'order:(group,distanceOf)=>sortEvents(group,order,languageCode,distanceOf)',
    )
  })
})
