import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  coLocatedSpecs,
  isLaneSource,
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

const write = (root: string, rel: string, text: string) => {
  mkdirSync(join(root, dirname(rel)), { recursive: true })
  writeFileSync(join(root, rel), text)
}

/**
 * A tree in the three shapes this selection reads, to assert each source in isolation.
 *
 * It assumes the lane collects `src/**` and `scripts/**` specs named `*.test.ts(x)`, that a
 * cross-directory import is written `@/…`, and that a spec reading source text off disk names it
 * as a quoted repo-relative path. Verified against `vitest.config.ts`'s `include`, `src/AGENTS.md`
 * ("Imports"), and `src/lib/brand.test.ts`'s `COPY_FILES`.
 */
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'select-unit-specs-'))

  write(root, 'src/lib/thing.ts', 'export const thing = 1\n')
  write(root, 'src/lib/thing.test.ts', "import { thing } from './thing'\n")
  write(root, 'src/lib/thing.edge.test.ts', "import { thing } from './thing'\n")
  write(root, 'src/lib/neighbour.test.ts', "import { other } from './other'\n")
  write(root, 'src/lib/thing-other.ts', 'export const other = 2\n')
  write(root, 'src/views/importer.test.tsx', "import { thing } from '@/lib/thing'\n")
  write(root, 'src/views/prefix.test.tsx', "import { other } from '@/lib/thing-other'\n")
  write(root, 'src/views/lister.test.tsx', "const COPY = ['src/lib/thing.ts']\n")
  write(root, 'src/views/walker.test.tsx', 'readdirSync(SRC, { recursive: true })\n')

  return root
}

const withFixture = (assert: (root: string) => void) => {
  const root = fixture()

  try {
    assert(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

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
    withFixture((root) => {
      const specs = listSpecs(root)

      expect(coLocatedSpecs('src/lib/thing.ts', specs)).toEqual([
        'src/lib/thing.edge.test.ts',
        'src/lib/thing.test.ts',
      ])
    })
  })

  it('takes a spec edited directly, through its own stem', () => {
    withFixture((root) => {
      expect(coLocatedSpecs('src/lib/thing.edge.test.ts', listSpecs(root))).toContain(
        'src/lib/thing.edge.test.ts',
      )
    })
  })
})

describe('referencingSpecs', () => {
  it('reaches an aliased importer and a spec that lists the path, across directories', () => {
    withFixture((root) => {
      const specs = listSpecs(root)
      const read = (spec: string) => readFileSync(join(root, spec), 'utf8')

      expect(referencingSpecs('src/lib/thing.ts', specs, read)).toEqual([
        'src/views/importer.test.tsx',
        'src/views/lister.test.tsx',
      ])
    })
  })

  it('stops at the specifier boundary, so a longer name is not a match', () => {
    withFixture((root) => {
      const specs = listSpecs(root)
      const read = (spec: string) => readFileSync(join(root, spec), 'utf8')

      expect(referencingSpecs('src/lib/thing.ts', specs, read)).not.toContain(
        'src/views/prefix.test.tsx',
      )
    })
  })
})

describe('selectSpecs', () => {
  it('runs a tree-walking spec that holds no reference to the edit', () => {
    withFixture((root) => {
      expect(selectSpecs('src/lib/thing.ts', root)).toEqual([
        'src/lib/thing.edge.test.ts',
        'src/lib/thing.test.ts',
        'src/views/importer.test.tsx',
        'src/views/lister.test.tsx',
        'src/views/walker.test.tsx',
      ])
    })
  })

  it('selects nothing for a path the hook must not act on', () => {
    withFixture((root) => {
      expect(selectSpecs('src/components/atoms/Chip/Chip.stories.tsx', root)).toEqual([])
      expect(selectSpecs('docs/testing.md', root)).toEqual([])
    })
  })
})

describe('this repository', () => {
  const specs = listSpecs(ROOT)
  const texts = new Map(specs.map((spec) => [spec, readFileSync(join(ROOT, spec), 'utf8')]))
  const read = (spec: string) => texts.get(spec) ?? ''

  /**
   * The specs whose fixture is the source tree, so an edit anywhere is their input and no
   * reference to it exists. Adding one means adding it here: the hook runs this set on every edit,
   * and a tenth walker left out of it would stop being checked per edit without failing anything.
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

  it('walks the tree in exactly the specs named here', () => {
    expect(treeWalkingSpecs(specs, read).sort()).toEqual(WALKERS)
  })

  it('reaches the brand copy list from a file in another directory', () => {
    // `brand.test.ts` names `CompactEmbedView.tsx` in `COPY_FILES` and imports nothing from it,
    // which is the shape only the path needle can find.
    expect(selectSpecs('src/views/CompactEmbedView/CompactEmbedView.tsx', ROOT)).toContain(
      'src/lib/brand.test.ts',
    )
  })

  it('keeps every edit under the slice the budget is measured on', () => {
    const walkers = treeWalkingSpecs(specs, read)
    const sources = readdirSync(join(ROOT, 'src'), { recursive: true, encoding: 'utf8' })
      .map((entry) => `src/${entry.split(/[/\\]/).join('/')}`)
      .filter(isLaneSource)

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

    // 21 when `docs/testing.md`'s budget was measured, on `src/lib/shape/index.ts`. The ceiling is
    // what holds the per-edit time down, so a jump here is a re-measure, not a bump.
    expect(worst.count, `widest selection: ${worst.source}`).toBeLessThanOrEqual(24)
  })
})
