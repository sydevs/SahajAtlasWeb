import { readFileSync, readdirSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Chooses the specs one edit can break, for the per-edit hook
 * (`.claude/hooks/unit-test.mjs`). Three sources, because none of them reaches the others'
 * couplings:
 *
 *   1. **Co-located** — the stem's own siblings, so `Foo.tsx` reaches `Foo.test.tsx` and
 *      `Foo.mount.test.tsx` but not every spec sharing their folder.
 *   2. **Referencing** — a spec importing the module by `@/` alias, or naming its repo-relative
 *      path in a literal list the way `src/lib/brand.test.ts` does.
 *   3. **Tree-walking** — a spec whose fixture is the source tree holds no reference to the file
 *      that breaks it, so neither source above can find it and it always runs.
 *
 * ⚠ **It does not reach a spec coupled through a second module**: editing `geo.ts` runs
 * `geo.test.ts`, never `camera.test.ts`. `docs/testing.md` carries that trade, the budget this
 * runs inside, and why `vitest related` is not the answer here.
 */

/** Resolved against this module, so nothing here depends on the working directory. */
export const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')

/** Where the unit lane's specs live. `tests/` holds only smoke specs, which the lane excludes. */
const LANE_DIRS = ['src', 'scripts']

const SPEC = /\.(test|spec)\.(ts|tsx)$/
const SOURCE_EXT = /\.(ts|tsx)$/

/**
 * Calls that enumerate the tree rather than import from it. The trailing `(` is load-bearing —
 * `responsive.test.ts` names `readdirSync` in prose. Only `readdirSync(` occurs today, and the
 * rest are here because a spec written with another enumerator would otherwise drop out of the
 * per-edit set in silence, which is the one failure this list exists to prevent. `glob(` also
 * catches the `import.meta.glob(` form.
 */
const ENUMERATORS = ['readdirSync(', 'readdir(', 'globSync(', 'glob(']

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

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

/** Whether the per-edit hook covers this path at all. Stories are not in the unit lane. */
export function isLaneSource(rel) {
  return rel.startsWith('src/') && SOURCE_EXT.test(rel) && !rel.includes('.stories.')
}

/** Every spec file the unit lane collects, as repo-relative POSIX paths. */
export function listSpecs(root) {
  return LANE_DIRS.flatMap((dir) => listUnder(root, dir, (entry) => SPEC.test(entry)))
}

/** Every path the hook acts on — what the budget's width ceiling is measured over. */
export function listLaneSources(root) {
  return listUnder(root, 'src', (entry) => SOURCE_EXT.test(entry)).filter(isLaneSource)
}

/**
 * Matches the strings a spec must contain to reference this module: the `@/` alias
 * `src/AGENTS.md` requires for a cross-directory import, and the repo-relative path a spec
 * reading source text off disk names its inputs by. Each ends at a quote — without that boundary
 * `@/lib`, the needle for the `src/lib` barrel, matches every `@/lib/*` import in the tree and
 * the barrel selects twice the specs it should.
 */
function referencePattern(rel) {
  const alias = `@/${rel.replace(SOURCE_EXT, '').slice('src/'.length)}`
  const barrel = alias.endsWith('/index') ? [alias.slice(0, -'/index'.length)] : []

  return new RegExp(
    [rel, alias, ...barrel].flatMap((needle) => [`${needle}'`, `${needle}"`]).map(escape).join('|'),
  )
}

export function coLocatedSpecs(rel, specs) {
  const cut = rel.lastIndexOf('/')
  const dir = rel.slice(0, cut)
  const stem = rel.slice(cut + 1).replace(SPEC, '').replace(SOURCE_EXT, '')

  return specs.filter((spec) => {
    const slash = spec.lastIndexOf('/')
    if (spec.slice(0, slash) !== dir) return false

    const base = spec.slice(slash + 1).replace(SPEC, '')
    return base === stem || base.startsWith(`${stem}.`)
  })
}

export function referencingSpecs(rel, specs, read) {
  const pattern = referencePattern(rel)

  return specs.filter((spec) => pattern.test(read(spec)))
}

export function treeWalkingSpecs(specs, read) {
  return specs.filter((spec) => {
    const text = read(spec)
    return ENUMERATORS.some((call) => text.includes(call))
  })
}

/**
 * The specs to run for one edited path, sorted. Empty means the hook should not run: either the
 * path is outside the lane, or the tree holds no specs at all.
 */
export function selectSpecs(rel, root = REPO_ROOT) {
  if (!isLaneSource(rel)) return []

  const specs = listSpecs(root)
  const texts = new Map(specs.map((spec) => [spec, readText(root, spec)]))
  const read = (spec) => texts.get(spec) ?? ''

  return [
    ...new Set([
      ...coLocatedSpecs(rel, specs),
      ...referencingSpecs(rel, specs, read),
      ...treeWalkingSpecs(specs, read),
    ]),
  ].sort()
}
