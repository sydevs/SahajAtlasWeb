import { readFileSync, readdirSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Chooses the specs one edit can break, for the per-edit hook
 * (`.claude/hooks/unit-test.mjs`). Two sources, because neither reaches the other's coupling:
 *
 *   1. **Co-located** — the stem's own siblings, so `Foo.tsx` reaches `Foo.test.tsx` and
 *      `Foo.mount.test.tsx` but not every spec sharing their folder.
 *   2. **Referencing** — a spec that names the module, by any specifier the repo writes: the `@/`
 *      alias, a relative sibling, or a quoted repo-relative path the way `src/lib/brand.test.ts`
 *      does. Specifiers are resolved, never matched by name, because the three forms address one
 *      module and a spec picks whichever its own directory makes natural.
 *
 * `readLane` reports a third set this does not select: the **tree-walking** specs, whose fixture
 * is the source tree, so no reference to the edited file exists in them and nothing here can
 * reach one. They run in `pnpm test:run`, the lean gate and CI instead (#293), and
 * `select-unit-specs.test.ts` keeps them a closed list so one cannot leave the set unnoticed.
 *
 * ⚠ **It does not reach a spec coupled through a second module**: editing `geo.ts` runs
 * `geo.test.ts`, never `camera.test.ts`. Nor does it reach an inventory an edit breaks —
 * `docs/testing.md` carries both trades, the budget this runs inside, and why `vitest related`
 * is not the answer here.
 */

/** Resolved against this module, so nothing here depends on the working directory. */
export const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')

/**
 * Where the unit lane's specs and their subjects both live. `tests/` holds only smoke specs,
 * which the lane excludes. One list, because a directory whose specs are indexed but whose
 * sources are refused selects nothing for its own edits.
 */
const LANE_DIRS = ['src', 'scripts']

const SPEC = /\.(test|spec)\.(ts|tsx)$/
/** `.mjs` is here for `scripts/`, which ships its sources as modules and its specs as TypeScript. */
const SOURCE_EXT = /\.(ts|tsx|mjs)$/

/** Anything quoted. Most matches are prose, and resolve to nothing. */
const QUOTED = /['"]([^'"\n]+)['"]/g

/**
 * Calls that enumerate the tree rather than import from it. The trailing `(` is load-bearing —
 * a spec can name `readdirSync` in prose. Only `readdirSync(` occurs today, and the rest are here
 * because a spec written with another enumerator would otherwise drop out of the per-edit set in
 * silence, which is the one failure this list exists to prevent. `glob(` also catches the
 * `import.meta.glob(` form.
 */
const ENUMERATES = /readdirSync\(|readdir\(|globSync\(|glob\(/

/**
 * The shared walk of `src/` (#286). A spec that imports it enumerates the tree without making any
 * call above, so importing it is what marks a walker — found through the reference index, which
 * already resolves every specifier form.
 */
const SHARED_WALK = 'src/test-support/source-tree.ts'

// `readdirSync` yields the OS separator, and every path here is POSIX, the way the specs that
// already walk `src/` write theirs.
const listUnder = (root, dir, keep) => {
  try {
    return readdirSync(join(root, dir), { recursive: true, encoding: 'utf8' })
      .filter(keep)
      .map((entry) => `${dir}/${entry.split(sep).join('/')}`)
  } catch {
    return []
  }
}

const readText = (root, rel) => {
  try {
    return readFileSync(join(root, rel), 'utf8')
  } catch {
    return ''
  }
}

const dirOf = (rel) => rel.slice(0, rel.lastIndexOf('/'))

/** Whether the per-edit hook covers this path at all. Stories are not in the unit lane. */
export function isLaneSource(rel) {
  return (
    LANE_DIRS.some((dir) => rel.startsWith(`${dir}/`)) &&
    SOURCE_EXT.test(rel) &&
    !rel.includes('.stories.')
  )
}

/** Every spec file the unit lane collects, as repo-relative POSIX paths. */
export function listSpecs(root) {
  return LANE_DIRS.flatMap((dir) => listUnder(root, dir, (entry) => SPEC.test(entry)))
}

/** Every path the hook acts on — what the budget's width ceiling is measured over. */
export function listLaneSources(root) {
  return LANE_DIRS.flatMap((dir) =>
    listUnder(root, dir, (entry) => SOURCE_EXT.test(entry)),
  ).filter(isLaneSource)
}

/** The repo-relative module a specifier addresses from `fromDir`, or null for a bare package. */
export function resolveSpecifier(specifier, fromDir) {
  if (specifier.startsWith('@/')) return `src/${specifier.slice(2)}`
  if (specifier.startsWith('src/') || specifier.startsWith('scripts/')) return specifier
  if (specifier !== '.' && !specifier.startsWith('./') && !specifier.startsWith('../')) return null

  const parts = fromDir.split('/')
  for (const segment of specifier.split('/')) {
    if (segment === '..') parts.pop()
    else if (segment !== '.' && segment !== '') parts.push(segment)
  }

  return parts.join('/')
}

/**
 * How a resolved specifier can address this module: with its extension, as a quoted path list
 * names it; without, as an import writes it; and by its folder, which is how a spec reaches a
 * per-component barrel (`Chip.test.tsx` imports `'.'`).
 */
const referenceKeys = (rel) => {
  const noExt = rel.replace(SOURCE_EXT, '')
  const folder = noExt.endsWith('/index') ? [dirOf(noExt)] : []

  return [rel, noExt, ...folder]
}

/** Every spec by the modules its own text names. One pass answers every source. */
function referenceIndex(specs, read) {
  const index = new Map()

  for (const spec of specs) {
    const from = dirOf(spec)

    for (const [, specifier] of read(spec).matchAll(QUOTED)) {
      const target = resolveSpecifier(specifier, from)
      if (!target) continue

      const named = index.get(target)
      if (named) named.add(spec)
      else index.set(target, new Set([spec]))
    }
  }

  return index
}

export function coLocatedSpecs(rel, specs) {
  const dir = dirOf(rel)
  const stem = rel.slice(dir.length + 1).replace(SPEC, '').replace(SOURCE_EXT, '')

  return specs.filter((spec) => {
    if (dirOf(spec) !== dir) return false

    const base = spec.slice(dir.length + 1).replace(SPEC, '')
    return base === stem || base.startsWith(`${stem}.`)
  })
}

export function referencingSpecs(rel, index) {
  return [...new Set(referenceKeys(rel).flatMap((key) => [...(index.get(key) ?? [])]))]
}

/** Reported by `readLane`, not selected per edit (#293) — the closed-list pin is its one reader. */
function treeWalkingSpecs(specs, read, index) {
  const viaSharedWalk = new Set(referencingSpecs(SHARED_WALK, index))

  return specs.filter((spec) => viaSharedWalk.has(spec) || ENUMERATES.test(read(spec)))
}

/** The lane's spec text, read once. Every selection below is answered from this. */
export function readLane(root) {
  const specs = listSpecs(root)
  const texts = new Map(specs.map((spec) => [spec, readText(root, spec)]))
  const read = (spec) => texts.get(spec) ?? ''
  const index = referenceIndex(specs, read)

  return { specs, index, walkers: treeWalkingSpecs(specs, read, index) }
}

/**
 * The specs to run for one edited path, sorted. Empty means the hook should not run, and that is
 * the common case rather than an edge one (#293): a lane source no spec names has nothing to run,
 * so the hook exits before it spawns vitest at all.
 */
export function selectFrom(rel, lane) {
  if (!isLaneSource(rel)) return []

  return [
    ...new Set([...coLocatedSpecs(rel, lane.specs), ...referencingSpecs(rel, lane.index)]),
  ].sort()
}

// Gated before `readLane`, not inside `selectFrom`: the hook fires on every Edit and Write, so
// a Markdown or JSON edit would otherwise pay a recursive `readdir` of both lane directories plus
// 140 spec reads (~32ms) to be told its path is outside the lane.
export const selectSpecs = (rel, root = REPO_ROOT) =>
  isLaneSource(rel) ? selectFrom(rel, readLane(root)) : []
