// `.claude/hooks/unit-test.mjs` pays this selection on every `src/**` edit, and `docs/testing.md`
// states the budget it has to fit. Nothing times the hook, so what is pinned here is the property
// the budget rests on: the selection stays a bounded slice of the lane, and the tree-walking specs
// stay out of it while staying a closed list (#293).

import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  coLocatedSpecs,
  isLaneSource,
  listLaneSources,
  listSpecs,
  readLane,
  referencingSpecs,
  REPO_ROOT as ROOT,
  resolveSpecifier,
  selectFrom,
  selectSpecs,
} from './select-unit-specs.mjs'

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
 * A tree in the shapes this selection reads, to assert each source in isolation.
 *
 * It assumes the lane collects `src/**` and `scripts/**` specs named `*.test.ts(x)`, that an
 * import is written either `@/…` or relative, and that a spec reading source text off disk names
 * it as a quoted repo-relative path. The first is asserted against `vitest.config.ts` below. The
 * others are `src/AGENTS.md`'s "Imports" rule and `src/lib/brand.test.ts`'s `COPY_FILES`.
 */
let fixture: string

beforeAll(() => {
  fixture = mkdtempSync(join(tmpdir(), 'select-unit-specs-'))

  write(fixture, 'src/lib/thing.ts', 'export const thing = 1\n')
  write(fixture, 'src/lib/thing.test.ts', "import { thing } from './thing'\n")
  write(fixture, 'src/lib/thing.edge.test.ts', "import { thing } from './thing'\n")
  write(fixture, 'src/lib/neighbour.test.ts', "import { thing } from './thing'\n")
  write(fixture, 'src/lib/thing-other.ts', 'export const other = 2\n')
  // No spec names this one: the hook exits on an empty selection, before any vitest run (#293).
  write(fixture, 'src/lib/unspoken.ts', 'export const unspoken = 3\n')
  write(fixture, 'src/views/importer.test.tsx', "import { thing } from '@/lib/thing'\n")
  write(fixture, 'src/views/prefix.test.tsx', "import { other } from '@/lib/thing-other'\n")
  write(fixture, 'src/views/lister.test.tsx', "const COPY = ['src/lib/thing.ts']\n")
  write(fixture, 'src/views/walker.test.tsx', 'readdirSync(SRC, { recursive: true })\n')
  write(fixture, 'src/test-support/source-tree.ts', 'export const sourceFiles = () => []\n')
  write(
    fixture,
    'src/views/shared.test.tsx',
    "import { sourceFiles } from '@/test-support/source-tree'\n",
  )
})

afterAll(() => {
  rmSync(fixture, { recursive: true, force: true })
})

describe('isLaneSource', () => {
  it('covers both lane directories, and nothing else the hook can see', () => {
    expect(isLaneSource('src/lib/geo.ts')).toBe(true)
    expect(isLaneSource('src/lib/geo.test.ts')).toBe(true)
    // `scripts/` ships `.mjs` sources, and `listSpecs` indexes its specs either way.
    expect(isLaneSource('scripts/select-unit-specs.mjs')).toBe(true)
    expect(isLaneSource('scripts/select-unit-specs.test.ts')).toBe(true)
    expect(isLaneSource('src/components/atoms/Chip/Chip.stories.tsx')).toBe(false)
    expect(isLaneSource('docs/testing.md')).toBe(false)
  })
})

describe('resolveSpecifier', () => {
  it('addresses one module through every specifier the repo writes', () => {
    expect(resolveSpecifier('@/lib/geo', 'src/views')).toBe('src/lib/geo')
    expect(resolveSpecifier('./client', 'src/config/api')).toBe('src/config/api/client')
    expect(resolveSpecifier('../geo', 'src/lib/shape')).toBe('src/lib/geo')
    expect(resolveSpecifier('.', 'src/components/atoms/Chip')).toBe('src/components/atoms/Chip')
    expect(resolveSpecifier('src/App.tsx', 'src/lib')).toBe('src/App.tsx')
  })

  it('ignores a bare package, so node_modules never enters the index', () => {
    expect(resolveSpecifier('react-dom/server', 'src/lib')).toBeNull()
    expect(resolveSpecifier('it renders the chip', 'src/lib')).toBeNull()
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
  it('reaches an alias, a relative sibling and a path list, and no longer name', () => {
    // `prefix.test.tsx` imports `@/lib/thing-other`, which matching the module's name rather than
    // resolving the specifier would hit.
    expect(referencingSpecs('src/lib/thing.ts', readLane(fixture).index).sort()).toEqual([
      'src/lib/neighbour.test.ts',
      'src/lib/thing.edge.test.ts',
      'src/lib/thing.test.ts',
      'src/views/importer.test.tsx',
      'src/views/lister.test.tsx',
    ])
  })
})

describe('selectFrom', () => {
  it('leaves the tree-walking specs out of the selection', () => {
    // The fixture carries one walker of each kind — `walker.test.tsx` enumerates,
    // `shared.test.tsx` imports the shared walk — so taking either back into `selectFrom` fails
    // here. A detector that stopped matching is the closed list below, not this.
    expect(selectFrom('src/lib/thing.ts', readLane(fixture))).toEqual([
      'src/lib/neighbour.test.ts',
      'src/lib/thing.edge.test.ts',
      'src/lib/thing.test.ts',
      'src/views/importer.test.tsx',
      'src/views/lister.test.tsx',
    ])
  })

  it('selects nothing for a lane source no spec names', () => {
    expect(selectFrom('src/lib/unspoken.ts', readLane(fixture))).toEqual([])
  })

  it('selects nothing for a path the hook must not act on', () => {
    expect(selectFrom('src/components/atoms/Chip/Chip.stories.tsx', readLane(fixture))).toEqual([])
  })
})

describe('this repository', () => {
  const lane = readLane(ROOT)

  /**
   * The specs whose fixture is the source tree, so an edit anywhere is their input and no
   * reference to it exists. The hook no longer runs them per edit (#293), so this list gates
   * nothing — it documents. It is the register of which specs carry no per-edit signal, the set
   * `docs/testing.md`'s trade paragraph is scoped by, and a spec joining or leaving it fails here
   * and nowhere else.
   *
   * The nine `src/` inventories and `source-tree.test.ts` are found by importing the shared walk
   * (#286); the rest by an enumerating call. `wrangler-config.test.ts` lists only the repo root,
   * so no lane edit can break it, but the detector over-includes on purpose and it costs nothing
   * measurable.
   */
  const WALKERS = [
    'scripts/select-unit-specs.test.ts',
    'scripts/wrangler-config.test.ts',
    'src/Widget.standalone.test.ts',
    'src/components/atoms/Icons/Icons.usage.test.tsx',
    'src/config/api/reads.inventory.test.ts',
    'src/config/responsive.test.ts',
    'src/config/translations.test.ts',
    'src/hooks/use-map-controller.test.ts',
    'src/lib/announce-site.test.ts',
    'src/lib/overlay.popper.test.ts',
    'src/lib/shape/href.test.ts',
    'src/test-support/source-tree.test.ts',
  ]

  it('enumerates the tree in exactly the specs named here', () => {
    expect([...lane.walkers].sort()).toEqual(WALKERS)
  })

  it('reaches the three specifier forms the repo actually writes', () => {
    // One end-to-end `selectSpecs` call per form, against the real tree, because a pure test of
    // the parts cannot say the composition reaches them. `brand.test.ts` only names
    // `CompactEmbedView.tsx` in `COPY_FILES`; `fetch.test.ts` is the only spec for `client.ts`
    // and imports it as `./client`; `Chip.test.tsx` imports its folder as `'.'`.
    expect(selectSpecs('src/views/CompactEmbedView/CompactEmbedView.tsx', ROOT)).toContain(
      'src/lib/brand.test.ts',
    )
    expect(selectSpecs('src/config/api/client.ts', ROOT)).toContain('src/config/api/fetch.test.ts')
    expect(selectSpecs('src/components/atoms/Chip/index.ts', ROOT)).toContain(
      'src/components/atoms/Chip/Chip.test.tsx',
    )
  })

  it('selects a scripts spec for its own subject, which the lane already indexes', () => {
    expect(selectSpecs('scripts/select-unit-specs.mjs', ROOT)).toContain(
      'scripts/select-unit-specs.test.ts',
    )
  })

  it('looks where the lane collects, so a spec outside those two directories fails here', () => {
    const config = readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8')
    const array = (key: string): string[] =>
      JSON.parse(matched(config, new RegExp(`${key}: (\\[[^\\]]*\\])`)).replace(/'/g, '"'))

    expect(array('include')).toEqual(['**/*.{test,spec}.{ts,tsx}'])

    const pruned = new Set(['.git', ...array('exclude').map((g) => g.replace(/\/\*\*$/, ''))])
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
    const sources = listLaneSources(ROOT)

    expect(sources.length).toBeGreaterThan(300)

    const worst = sources
      .map((source) => ({ source, count: selectFrom(source, lane).length }))
      .reduce((a, b) => (b.count > a.count ? b : a))

    // 16, on `src/test-support/repo-source.ts` (#289) — every spec reading one repo file names
    // it, and a spec may read one no other way, so this grows by one per adopter. ⚠ The widest
    // is no longer the slowest: `i18n.ts` selects 12, four of them jsdom, and measures 6.6s
    // against the widest selection's 4.5s and three. So this bounds width as a proxy, and the
    // answer when it trips is to time the hook and ratchet, never to drop a spec from the
    // selection. `docs/testing.md` carries the times and the method.
    expect(worst.count, `widest selection: ${worst.source}`).toBeLessThanOrEqual(16)
  })
})
