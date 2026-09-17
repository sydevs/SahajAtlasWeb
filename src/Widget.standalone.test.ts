import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * What the embedded `<sahaj-atlas>` element is not allowed to reach.
 *
 * Live preview was safe by accident until now: capture only fired when the pathname was
 * `/preview`, so wiring it into the widget would have been visibly pointless. That gate is
 * gone — a token on any URL opens a session — and nothing structural replaced it. The two
 * standalone-only modules would both misbehave inside a host page, and neither would say so:
 *
 * - **`config/live-preview/boot.ts`** rewrites `window.location`. Embedded, that URL is the
 *   HOST's, and the widget would be rewriting a URL it does not own — in their address bar, on
 *   their analytics, in their `document.referrer`, in whatever their page does with `location`.
 * - **`config/live-preview/token.ts`** is bytes the widget has no use for, in a graph with a
 *   hard budget and single-digit KiB spare.
 *
 * ⚠ **This walks the real import graph, static AND dynamic.** A `lazy(() => import(…))` is
 * still the widget reaching it, just later — and the size gate cannot see this class of
 * mistake at all, because a shared chunk costs no bytes.
 *
 * `config/live-preview/protocol.ts` is deliberately absent from the list. The request
 * interceptor and `App` both read the session it holds, so it IS in both graphs — which is why
 * that folder is split at all, and why it holds nothing but the state and the names.
 * Everything that BEHAVES is on the other side of this line.
 */

const SRC = dirname(fileURLToPath(import.meta.url))

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** Every specifier a module imports: `from '…'`, a bare side-effect import, and `import('…')`. */
function specifiers(source: string): string[] {
  const code = stripComments(source)
  const found: string[] = []

  for (const pattern of [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]) {
    for (const match of code.matchAll(pattern)) found.push(match[1])
  }

  return found
}

/** Our own modules only. A package specifier resolves to nothing here, which is the point. */
function resolveModule(specifier: string, fromFile: string): string | null {
  const base = specifier.startsWith('@/')
    ? join(SRC, specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(fromFile), specifier)
      : null

  if (!base) return null

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    ...['index.ts', 'index.tsx'].map((f) => join(base, f)),
  ]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate
    }
  }

  return null
}

function importGraph(entry: string): Set<string> {
  const seen = new Set<string>()
  const pending = [entry]

  while (pending.length) {
    const file = pending.pop()!

    if (seen.has(file)) continue
    seen.add(file)

    for (const specifier of specifiers(readFileSync(file, 'utf8'))) {
      const resolved = resolveModule(specifier, file)

      if (resolved) pending.push(resolved)
    }
  }

  return new Set([...seen].map((file) => relative(SRC, file).split(sep).join('/')))
}

/** The modules only the standalone entry may reach. */
const STANDALONE_ONLY = ['config/live-preview/boot.ts', 'config/live-preview/token.ts']

describe('the widget entry', () => {
  const widgetGraph = importGraph(join(SRC, 'Widget.tsx'))

  it.each(STANDALONE_ONLY)('cannot reach %s, by any import', (module) => {
    expect(widgetGraph).not.toContain(module)
  })

  it('cannot reach the standalone entry either', () => {
    expect(widgetGraph).not.toContain('main.tsx')
  })

  it('does reach the protocol, which carries the session both entries share', () => {
    // The negative assertions above are worth nothing unless this walker can actually see a
    // live-preview module. Without this they would pass just as happily against a broken
    // resolver that found nothing at all.
    expect(widgetGraph).toContain('config/live-preview/protocol.ts')
  })
})

/** Every non-spec module under `src/`, as a `/`-joined path relative to it. */
const SOURCES = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .map((path) => path.split(sep).join('/'))
  .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))

/**
 * Payload's own live-preview hook is admin-only, and must stay behind the one lazy seam.
 *
 * The graph walk above cannot see this: a package specifier resolves to nothing there, by
 * design. Nor can `pnpm size` — 1.6 KiB gzipped disappears inside the embed graph's spare
 * budget, and the gate would pass while every host on every page view paid for a hook only a
 * CMS editor can ever trigger. A closed importer list is what makes the seam enforceable, in
 * the manner of `config/responsive.test.ts`. A second importer is not automatically wrong, but
 * it is always a decision somebody has to make deliberately, and this is where they are asked.
 */
describe('the Payload live-preview library', () => {
  const importers = SOURCES.filter((path) =>
    specifiers(readFileSync(join(SRC, path), 'utf8')).some((specifier) =>
      specifier.startsWith('@payloadcms/live-preview'),
    ),
  )

  it('is imported by the lazily-mounted controller, its arms, and nothing else', () => {
    expect(importers).toEqual([
      'components/live-preview/LivePreviewController.tsx',
      'components/live-preview/SubmissionLivePreview.tsx',
    ])
  })
})

describe('the live-preview boot module', () => {
  const importers = SOURCES.filter((path) =>
    specifiers(readFileSync(join(SRC, path), 'utf8')).some(
      (specifier) => resolveModule(specifier, join(SRC, path)) === join(SRC, STANDALONE_ONLY[0]),
    ),
  )

  it('is imported by main.tsx and by nothing else', () => {
    // A closed list, in the manner of `config/responsive.test.ts`. A second importer is not
    // automatically wrong — but it is always a decision somebody has to make deliberately,
    // and this is where they are asked to make it.
    expect(importers).toEqual(['main.tsx'])
  })
})
