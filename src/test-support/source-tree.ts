import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The one walk of `src/` behind every spec that inventories the source (#286).
 *
 * Nine specs each rolled their own `readdirSync`, in three shapes that were not
 * interchangeable: two yielded the OS separator where the spec's own lists were written
 * POSIX-style, one yielded absolute paths, and the hand-rolled recursions re-entered every
 * directory themselves. A tenth spec inherited whichever shape its author copied.
 *
 * ⚠ **The SCOPES stay with the specs.** Each option below names one real distinction — a story
 * is not app code, a generated declaration has no call sites — and every caller states its own
 * set beside the assertions it serves. Widening or narrowing a spec's scope from here changes
 * what it asserts, silently and in the passing direction.
 */
export const SRC_DIR = fileURLToPath(new URL('..', import.meta.url))

/** Every file under `src/`, as a `/`-joined path relative to it. Walked once per process. */
const TREE: readonly string[] = readdirSync(SRC_DIR, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => relative(SRC_DIR, join(entry.parentPath, entry.name)).split(sep).join('/'))
  .sort()

/** Generated SahajCloud declarations: thousands of lines, no call sites, slowest to parse. */
const GENERATED_TYPES = 'types/payload/'

export type SourceScope = {
  /** Defaults to the app's two source extensions. `.css` is opt-in. */
  extensions?: readonly string[]
  includeSpecs?: boolean
  includeStories?: boolean
  includeDeclarations?: boolean
  includeGeneratedTypes?: boolean
}

export const sourceFiles = ({
  extensions = ['.ts', '.tsx'],
  includeSpecs = false,
  includeStories = false,
  includeDeclarations = true,
  includeGeneratedTypes = true,
}: SourceScope = {}): string[] =>
  TREE.filter(
    (path) =>
      extensions.some((extension) => path.endsWith(extension)) &&
      (includeSpecs || !/\.test\.tsx?$/.test(path)) &&
      (includeStories || !/\.stories\.tsx?$/.test(path)) &&
      (includeDeclarations || !path.endsWith('.d.ts')) &&
      (includeGeneratedTypes || !path.startsWith(GENERATED_TYPES)),
  )

const RAW = new Map<string, string>()

/** One module's raw source, read once per process. `path` is relative to `src/`. */
export const readSource = (path: string): string => {
  const cached = RAW.get(path)

  if (cached !== undefined) return cached

  const source = readFileSync(join(SRC_DIR, path), 'utf8')

  RAW.set(path, source)

  return source
}

const WITHOUT_COMMENTS = new Map<string, string>()

/**
 * The same source with comments removed, so a scan asserts about CODE, not prose.
 *
 * Without it, documenting a rule breaks it. The sentence "resize past the 768px crossing" in a
 * story's docblock read as a second hardcoded crossing, and `atoms/Dropdown` merely NAMING a
 * Radix package in a docblock read as a fifth popper.
 */
export const readSourceWithoutComments = (path: string): string => {
  const cached = WITHOUT_COMMENTS.get(path)

  if (cached !== undefined) return cached

  const source = readSource(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

  WITHOUT_COMMENTS.set(path, source)

  return source
}
