import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  coLocatedSpecs,
  isLaneSource,
  listLaneSources,
  listSpecs,
  referencingSpecs,
  selectSpecs,
  treeWalkingSpecs,
} from './select-unit-specs.mjs'

// `.claude/hooks/unit-test.mjs` pays this selection on every `src/**` edit, and `docs/testing.md`
// states the budget it has to fit. Nothing times the hook, so what is pinned here is the property
// the budget rests on: the selection stays a bounded slice of the lane, and the specs no reference
// can reach are in it anyway.
const ROOT = fileURLToPath(new URL('..', import.meta.url))

const SPEC_NAME = /\.(test|spec)\.(ts|tsx)$/

/** A missing match must fail, not pass vacuously on `undefined` (`ci-workflows.test.ts`). */
const matched = (text: string, re: RegExp) => {
  const found = re.exec(text)?.[1]

  expect(found, `nothing matched ${re}`).toBeTruthy()

  return found as string
}

const write = (root: string, rel: string, text: string) => {
  mkdirSync(join(root, dirname(rel)), { recursive: true })
  writeFileSync(join(root, rel), text)
}

/**
 * A tree in the three shapes this selection reads, to assert each source in isolation.
 *
 * It assumes the lane collects `src/**` and `scripts/**` specs named `*.test.ts(x)`, that a
 * cross-directory import is written `@/…`, and that a spec reading source text off disk names it
 * as a quoted repo-relative path. The first is asserted against `vitest.config.ts` below. The
 * other two are `src/AGENTS.md`'s "Imports" rule and `src/lib/brand.test.ts`'s `COPY_FILES`.
 */
let fixture: string

beforeAll(() => {
  fixture = mkdtempSync(join(tmpdir(), 'select-unit-specs-'))

  write(fixture, 'src/lib/thing.ts', 'export const thing = 1\n')
  write(fixture, 'src/lib/thing.test.ts', "import { thing } from './thing'\n")
  write(fixture, 'src/lib/thing.edge.test.ts', "import { thing } from './thing'\n")
  write(fixture, 'src/lib/neighbour.test.ts', "import { other } from './other'\n")
  write(fixture, 'src/lib/thing-other.ts', 'export const other = 2\n')
  write(fixture, 'src/views/importer.test.tsx', "import { thing } from '@/lib/thing'\n")
  write(fixture, 'src/views/prefix.test.tsx', "import { other } from '@/lib/thing-other'\n")
  write(fixture, 'src/views/lister.test.tsx', "const COPY = ['src/lib/thing.ts']\n")
  write(fixture, 'src/views/walker.test.tsx', 'readdirSync(SRC, { recursive: true })\n')
})

afterAll(() => {
  rmSync(fixture, { recursive: true, force: true })
})

const readFixture = (spec: string) => readFileSync(join(fixture, spec), 'utf8')

describe('isLaneSource', () => {
  it('covers src modules and specs, and nothing else the hook can see', () => {
    expect(isLaneSource('src/lib/geo.ts')).toBe(true)
    expect(isLaneSource('src/lib/geo.test.ts')).toBe(true)
    expect(isLaneSource('src/components/atoms/Chip/Chip.stories.tsx')).toBe(false)
    expect(isLaneSource('scripts/select-unit-specs.mjs')).toBe(false)
    expect(isLaneSource('docs/testing.md')).toBe(false)
  })
})

describe('coLocatedSpecs', () => {
  it('takes the stem siblings, not the whole folder', () => {
    expect(coLocatedSpecs('src/lib/thing.ts', listSpecs(fixture))).toEqual([
      'src/lib/thing.edge.test.ts',
      'src/lib/thing.test.ts',
    ])
  })

  it('takes a spec edited directly, through its own stem', () => {
    expect(coLocatedSpecs('src/lib/thing.edge.test.ts', listSpecs(fixture))).toContain(
      'src/lib/thing.edge.test.ts',
    )
  })
})

describe('referencingSpecs', () => {
  it('reaches an aliased importer and a path list, and stops at the specifier boundary', () => {
    // `prefix.test.tsx` imports `@/lib/thing-other`, which a needle missing its closing quote
    // would match.
    expect(referencingSpecs('src/lib/thing.ts', listSpecs(fixture), readFixture)).toEqual([
      'src/views/importer.test.tsx',
      'src/views/lister.test.tsx',
    ])
  })
})

describe('selectSpecs', () => {
  it('runs a tree-walking spec that holds no reference to the edit', () => {
    expect(selectSpecs('src/lib/thing.ts', fixture)).toEqual([
      'src/lib/thing.edge.test.ts',
      'src/lib/thing.test.ts',
      'src/views/importer.test.tsx',
      'src/views/lister.test.tsx',
      'src/views/walker.test.tsx',
    ])
  })

  it('selects nothing for a path the hook must not act on', () => {
    expect(selectSpecs('src/components/atoms/Chip/Chip.stories.tsx', fixture)).toEqual([])
  })
})

describe('this repository', () => {
  const specs = listSpecs(ROOT)
  const texts = new Map(specs.map((spec) => [spec, readFileSync(join(ROOT, spec), 'utf8')]))
  const read = (spec: string) => texts.get(spec) ?? ''

  /**
   * The specs whose fixture is the source tree, so an edit anywhere is their input and no
   * reference to it exists. Adding one means adding it here: the hook runs this set on every
   * edit, and one left out would stop being checked per edit without failing anything.
   *
   * ⚠ #286 consolidates the nine `src/` inventories onto one shared walker. A spec that reaches
   * the tree through that helper instead of calling an enumerator stops matching, and this list
   * is what says so.
   */
  const WALKERS = [
    'scripts/select-unit-specs.test.ts',
    'src/Widget.standalone.test.ts',
    'src/components/atoms/Icons/Icons.usage.test.tsx',
    'src/config/api/reads.inventory.test.ts',
    'src/config/responsive.test.ts',
    'src/config/translations.test.ts',
    'src/hooks/use-map-controller.test.ts',
    'src/lib/announce-site.test.ts',
    'src/lib/overlay.popper.test.ts',
    'src/lib/shape/href.test.ts',
  ]

  it('enumerates the tree in exactly the specs named here', () => {
    expect(treeWalkingSpecs(specs, read).sort()).toEqual(WALKERS)
  })

  it('reaches the brand copy list from a file in another directory', () => {
    // The one end-to-end call against the real tree: `brand.test.ts` names
    // `CompactEmbedView.tsx` in `COPY_FILES` and imports nothing from it, the shape only the
    // path needle finds. A pure test of the parts cannot say `selectSpecs` reaches them.
    expect(selectSpecs('src/views/CompactEmbedView/CompactEmbedView.tsx', ROOT)).toContain(
      'src/lib/brand.test.ts',
    )
  })

  it('looks where the lane collects, so a spec outside those two directories fails here', () => {
    const config = readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8')
    const array = (key: string): string[] =>
      JSON.parse(matched(config, new RegExp(`${key}: (\\[[^\\]]*\\])`)).replace(/'/g, '"'))

    expect(array('include')).toEqual(['**/*.{test,spec}.{ts,tsx}'])

    const pruned = new Set(['.git', ...array('exclude').map((glob) => glob.replace(/\/\*\*$/, ''))])
    const outside = (dir: string): string[] =>
      readdirSync(join(ROOT, dir || '.'), { withFileTypes: true }).flatMap((entry) => {
        const rel = dir ? `${dir}/${entry.name}` : entry.name

        if (!entry.isDirectory()) return SPEC_NAME.test(entry.name) ? [rel] : []
        if (pruned.has(entry.name) || pruned.has(rel)) return []

        return rel === 'src' || rel === 'scripts' ? [] : outside(rel)
      })

    expect(outside('')).toEqual([])
  })

  it('keeps every edit under the slice the budget is measured on', () => {
    const walkers = treeWalkingSpecs(specs, read)
    const sources = listLaneSources(ROOT)

    expect(sources.length).toBeGreaterThan(300)

    const worst = sources
      .map((source) => ({
        source,
        count: new Set([
          ...coLocatedSpecs(source, specs),
          ...referencingSpecs(source, specs, read),
          ...walkers,
        ]).size,
      }))
      .reduce((a, b) => (b.count > a.count ? b : a))

    // 22 when `docs/testing.md`'s budget was measured, on `src/lib/shape/index.ts`. The ceiling
    // is what holds the per-edit time down, so a jump here is a re-measure, not a bump.
    expect(worst.count, `widest selection: ${worst.source}`).toBeLessThanOrEqual(24)
  })
})
