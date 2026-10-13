import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// The one walk of `src/` behind every spec that inventories the source (#286). Nine specs rolled
// their own, in three incompatible path shapes.
//
// ⚠ **The SCOPES stay with the specs.** Each option below names one real distinction, and every
// caller states its own beside the assertions it serves. Widening or narrowing a spec's scope
// from here changes what it asserts, silently and in the passing direction.

const SRC_DIR = fileURLToPath(new URL('..', import.meta.url))

/** Every file under `src/`, as a `/`-joined path relative to it, sorted. */
const TREE: readonly string[] = readdirSync(SRC_DIR, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => relative(SRC_DIR, join(entry.parentPath, entry.name)).split(sep).join('/'))
  .sort()

type SourceScope = {
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
      // The generated SahajCloud types are plain `.ts`, so this cannot fold into the line above.
      (includeGeneratedTypes || !path.startsWith('types/payload/')),
  )

/** One cache per computation, so a caller that never asks for a parse never pays for one. */
export const memo = <T>(compute: (path: string) => T): ((path: string) => T) => {
  const cache = new Map<string, T>()

  return (path) => {
    if (!cache.has(path)) cache.set(path, compute(path))

    return cache.get(path)!
  }
}

/**
 * Comments removed, so a scan asserts about CODE rather than prose.
 *
 * Without this, documenting a rule breaks it. "Resize past the 768px crossing" in a story's
 * docblock read as a second hardcoded crossing, and `atoms/Dropdown` merely NAMING a Radix
 * package in a docblock read as a fifth popper. The `[^:]` guard is what keeps a `https://`
 * literal out of the line-comment pattern.
 */
export const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** One module's raw source. `path` is relative to `src/`. */
export const readSource = memo((path) => readFileSync(join(SRC_DIR, path), 'utf8'))

/** The same source, comment-stripped. `path` is relative to `src/`. */
export const readSourceWithoutComments = memo((path) => stripComments(readSource(path)))
