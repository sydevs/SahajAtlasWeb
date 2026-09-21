import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { LIVE_PREVIEW_HEADER } from './config/live-preview/request'

/**
 * What the embedded `<sahaj-atlas>` element is not allowed to reach.
 *
 * Live preview was safe by accident until now: capture only fired when the pathname was
 * `/preview`, so wiring it into the widget would have been visibly pointless. That gate is
 * gone — a token on any URL opens a session — and nothing structural replaced it. The three
 * standalone-only modules would all misbehave inside a host page, and none would say so:
 *
 * - **`config/live-preview/boot.ts`** rewrites `window.location`. Embedded, that URL is the
 *   HOST's, and the widget would be rewriting a URL it does not own — in their address bar, on
 *   their analytics, in their `document.referrer`, in whatever their page does with `location`.
 * - **`config/live-preview/token.ts`** is bytes the widget has no use for, in a graph with a
 *   hard budget and single-digit KiB spare.
 * - **`config/live-preview/request.ts`** spends the credential. No host page can open a
 *   session — the writer list below closes that — so it must not carry the code that would
 *   use one, nor the header name a writer would need (#217).
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

/** One module's source, comments removed — as `config/responsive.test.ts` spells it. */
const read = (module: string) => stripComments(readFileSync(join(SRC, module), 'utf8'))

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

const BOOT = 'config/live-preview/boot.ts'
const REQUEST = 'config/live-preview/request.ts'
const SETTER_HOME = 'config/api/client.ts'

/** The modules only the standalone entry may reach. */
const STANDALONE_ONLY = [BOOT, 'config/live-preview/token.ts', REQUEST]

/** Which of a set of modules spell a string in code, rather than in a comment about it. */
const modulesCarrying = (modules: Iterable<string>, literal: string) =>
  [...modules].filter((module) => read(module).includes(literal))

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

  it('spells the preview header name in no module it can reach', () => {
    // ⚠ The walk above is about behaviour; this is about the WIRE NAME, and a writer needs
    // nothing else (#217). The literal comes off the real constant, so a rename cannot point
    // this scan at a string nothing uses.
    expect(modulesCarrying(widgetGraph, LIVE_PREVIEW_HEADER)).toEqual([])
  })

  it('finds that name where it does live, or the scan above proves nothing', () => {
    expect(modulesCarrying(SOURCES, LIVE_PREVIEW_HEADER)).toEqual([REQUEST])
  })

  it('names the decorator setter in no module it can reach but the one defining it', () => {
    // ⚠ **The slot is IN this graph** — `client.ts` exports its setter, and the header is a
    // 30-character string anyone can spell. So the widget's inability to spend the credential
    // is this closed caller list, not a structural impossibility. A second name here is
    // somebody re-attaching the credential by hand, which is exactly what #217 removed.
    expect(modulesCarrying(widgetGraph, 'setPreviewRequestDecorator')).toEqual([SETTER_HOME])
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

/** Every module under `src/` that imports one of ours, by its path relative to `src/`. */
const importersOf = (module: string) =>
  SOURCES.filter((path) =>
    specifiers(read(path)).some(
      (specifier) => resolveModule(specifier, join(SRC, path)) === join(SRC, module),
    ),
  )

/**
 * Each standalone-only module's closed importer list, in the manner of
 * `config/responsive.test.ts`. A second importer is not automatically wrong — but it is always
 * a decision somebody has to make deliberately, and this is where they are asked to make it.
 *
 * `request.ts` is the one the widget's own graph could re-enter by: `applyRequestContext`
 * reaches the decorator through a slot rather than an import, so an importer appearing beside
 * `boot.ts` is someone re-attaching the credential by hand.
 */
describe.each([
  [BOOT, ['main.tsx']],
  [REQUEST, [BOOT]],
])('%s', (module, expected) => {
  it('is imported by that list and by nothing else', () => {
    expect(importersOf(module)).toEqual(expected)
  })
})

const PROTOCOL = join(SRC, 'config/live-preview/protocol.ts')

/** The name a module binds the session singleton to, or `null` where it imports no default. */
function sessionBinding(source: string, fromFile: string): string | null {
  const code = stripComments(source)
  const pattern = /\bimport\s+([A-Za-z_$][\w$]*)\s*(?:,[^'"]*?)?\bfrom\s+['"]([^'"]+)['"]/g

  for (const match of code.matchAll(pattern)) {
    if (resolveModule(match[2], fromFile) === PROTOCOL) return match[1]
  }

  return null
}

/** Whether a module MUTATES the session, as against the four that only read it. */
function writesSession(source: string, binding: string): boolean {
  const code = stripComments(source)

  return (
    new RegExp(String.raw`\bObject\.assign\s*\(\s*${binding}\b`).test(code) ||
    new RegExp(String.raw`\b${binding}\.\w+\s*=(?![=>])`).test(code)
  )
}

/**
 * Who may open a live-preview session.
 *
 * The graph walk above keeps `boot.ts` out of the widget, but `protocol.ts` holds the session
 * itself and IS in both graphs — a mutable singleton any importer can assign to.
 *
 * ⚠ **Since #217 the threat is the RESTRAINTS, not the credential.** A write alone sends
 * nothing: `request.ts` is outside this graph, so spending the token would take a second edit
 * filling the slot by hand — which the setter's closed caller list above is what forbids. What
 * such a write still does, on its own, is open a session on a page we do not own — every `<a>` inert, navigation snapping back, queries pinned to
 * `staleTime: Infinity`, a registration refused. That is a host page bricked, and it is reason
 * enough to keep this list closed.
 *
 * `boot.ts` verifies a signature before it flips `active`, and reaches only `main.tsx`. Closing
 * the writer list to it is what makes "a session is standalone-only" structural rather than
 * incidental. Reading the session stays open to anyone — four modules do.
 */
describe('the live-preview session', () => {
  const writers = SOURCES.filter((path) => {
    const source = readFileSync(join(SRC, path), 'utf8')
    const binding = sessionBinding(source, join(SRC, path))

    return binding !== null && writesSession(source, binding)
  })

  it('is opened by the standalone boot module and by nothing else', () => {
    expect(writers).toEqual([STANDALONE_ONLY[0]])
  })
})
