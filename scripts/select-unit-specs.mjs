import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Chooses the specs one edit can break, for the per-edit hook
 * (`.claude/hooks/unit-test.mjs`). The hook ran the whole lane on every `src/**` write,
 * which is what `docs/testing.md`'s per-edit budget had outgrown.
 *
 * Three sources, because none of them covers the others:
 *
 *   1. **Co-located** — the repo's own convention, so `Foo.tsx` reaches `Foo.test.tsx` and
 *      `Foo.mount.test.tsx` but not every spec sharing their folder.
 *   2. **Referencing** — a spec that imports the module by `@/` alias, or names its
 *      repo-relative path in a literal list the way `src/lib/brand.test.ts` does. Those two
 *      shapes are what a cross-directory coupling looks like here.
 *   3. **Tree-walking** — a spec whose input is `readdirSync` over the source tree holds no
 *      reference to the file that breaks it, so nothing above can find it and it always runs.
 *
 * What this deliberately does NOT reach is a spec coupled through a second module: editing
 * `geo.ts` runs `geo.test.ts`, never `camera.test.ts`. `vitest related` does reach it, and
 * measured 22s on that one file — the whole lane costs 33s, so the module graph here is too
 * connected to select from. The lean gate and CI still run the lane in full.
 */

const LANE_DIRS = ['src', 'scripts']

const SPEC = /\.(test|spec)\.(ts|tsx)$/
const SOURCE_EXT = /\.(ts|tsx)$/

/** A spec whose fixture is the tree itself, found by the one call that enumerates it. */
const WALKS_THE_TREE = /\breaddirSync\s*\(/

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Whether the per-edit hook covers this path at all. Stories are not in the unit lane. */
export function isLaneSource(rel) {
  return /^src\/.+/.test(rel) && SOURCE_EXT.test(rel) && !/\.stories\.(ts|tsx)$/.test(rel)
}

/** Every spec file the unit lane collects, as repo-relative POSIX paths. */
export function listSpecs(root) {
  return LANE_DIRS.flatMap((dir) => {
    let entries
    try {
      entries = readdirSync(join(root, dir), { recursive: true, encoding: 'utf8' })
    } catch {
      return []
    }
    return entries.map((entry) => `${dir}/${entry.split(/[/\\]/).join('/')}`).filter((p) => SPEC.test(p))
  })
}

/**
 * The strings a spec would have to contain to reference this module. The alias form is how
 * `src/AGENTS.md` requires cross-directory imports to be written; the repo-relative form is how
 * a spec that reads source text off disk names its inputs.
 */
export function referenceNeedles(rel) {
  const noExt = rel.replace(SOURCE_EXT, '')
  const needles = [rel, noExt, `@/${noExt.slice('src/'.length)}`]
  if (noExt.endsWith('/index')) {
    const dir = noExt.slice(0, -'/index'.length)
    needles.push(dir, `@/${dir.slice('src/'.length)}`)
  }
  return needles
}

export function coLocatedSpecs(rel, specs) {
  const slash = rel.lastIndexOf('/')
  const dir = rel.slice(0, slash)
  const stem = rel.slice(slash + 1).replace(SOURCE_EXT, '').replace(/\.(test|spec)$/, '')
  const sibling = new RegExp(`^${escape(stem)}(\\..+)?\\.(test|spec)\\.(ts|tsx)$`)
  return specs.filter((spec) => {
    const cut = spec.lastIndexOf('/')
    return spec.slice(0, cut) === dir && sibling.test(spec.slice(cut + 1))
  })
}

export function referencingSpecs(rel, specs, read) {
  // Both shapes end at a quote. Without that boundary `@/lib` — the needle for the `src/lib`
  // barrel — matches every `@/lib/*` import in the tree, and the barrel selects 40 specs.
  const needles = referenceNeedles(rel).flatMap((needle) => [`${needle}'`, `${needle}"`])
  return specs.filter((spec) => {
    const text = read(spec)
    return needles.some((needle) => text.includes(needle))
  })
}

export function treeWalkingSpecs(specs, read) {
  return specs.filter((spec) => WALKS_THE_TREE.test(read(spec)))
}

/**
 * The specs to run for one edited path, sorted. An empty array means the hook should not run:
 * either the path is outside the lane, or the tree holds no specs at all.
 */
export function selectSpecs(rel, root) {
  if (!isLaneSource(rel)) return []

  const specs = listSpecs(root)
  const cache = new Map()
  const read = (spec) => {
    if (!cache.has(spec)) {
      try {
        cache.set(spec, readFileSync(join(root, spec), 'utf8'))
      } catch {
        cache.set(spec, '')
      }
    }
    return cache.get(spec)
  }

  return [
    ...new Set([
      ...coLocatedSpecs(rel, specs),
      ...referencingSpecs(rel, specs, read),
      ...treeWalkingSpecs(specs, read),
    ]),
  ].sort()
}
