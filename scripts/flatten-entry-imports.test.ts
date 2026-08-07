import { describe, expect, it } from 'vitest'

import { flattenedImports, importClosure } from './flatten-entry-imports.mjs'

/**
 * The plugin exists so `embed.js` declares its whole eager graph, the way Vite's
 * modulepreload list does for `index.html`. What can silently go wrong is the graph walk
 * (missing a chunk means it stays a round trip late, with byte-identical output, so
 * `pnpm size` cannot see it) and the specifier math (only exercised if `entryFileNames`
 * ever moves the entry out of the output root). Both are pinned here — see issue #96.
 */
const chunk = (imports: string[] = []) => ({ type: 'chunk', imports })

// The real shape as of this writing: the entry imports most chunks directly, but `shared`
// and `fallbacks` hang off `App` — and `shared` is the largest chunk in the payload.
const bundle = {
  'assets/App.js': chunk(['assets/shared.js', 'assets/fallbacks.js', 'assets/runtime.js']),
  'assets/shared.js': chunk(['assets/runtime.js']),
  'assets/fallbacks.js': chunk(['assets/shared.js']),
  'assets/runtime.js': chunk(),
  'assets/style.css': { type: 'asset' as const },
}

describe('importClosure', () => {
  it('reaches chunks the entry does not import directly', () => {
    const closure = importClosure(bundle, { imports: ['assets/App.js'] })

    expect([...closure].sort()).toEqual([
      'assets/App.js',
      'assets/fallbacks.js',
      'assets/runtime.js',
      'assets/shared.js',
    ])
  })

  it('terminates on a cycle rather than hanging', () => {
    const cyclic = { 'a.js': chunk(['b.js']), 'b.js': chunk(['a.js']) }

    expect([...importClosure(cyclic, { imports: ['a.js'] })].sort()).toEqual(['a.js', 'b.js'])
  })

  it('ignores non-chunk assets and unknown specifiers', () => {
    const closure = importClosure(bundle, { imports: ['assets/style.css', 'node:fs'] })

    expect([...closure]).toEqual(['assets/style.css', 'node:fs'])
  })
})

describe('flattenedImports', () => {
  it('emits only the chunks the entry is missing, and leaves direct imports alone', () => {
    const entry = { fileName: 'embed.js', imports: ['assets/App.js', 'assets/runtime.js'] }
    const { missing, code } = flattenedImports(bundle, entry)

    expect(missing).toEqual(['assets/fallbacks.js', 'assets/shared.js'])
    expect(code).toBe('import "./assets/fallbacks.js";\nimport "./assets/shared.js";')
  })

  it('emits nothing when the entry already imports its whole closure', () => {
    const entry = {
      fileName: 'embed.js',
      imports: ['assets/App.js', 'assets/shared.js', 'assets/fallbacks.js', 'assets/runtime.js'],
    }

    expect(flattenedImports(bundle, entry).missing).toEqual([])
  })

  // The entry sits at the output root today; `entryFileNames` is free to move it, and a
  // specifier that is wrong by one directory is a 404 for a third of the payload.
  it('writes specifiers relative to the entry, not the output root', () => {
    const entry = { fileName: 'nested/embed.js', imports: ['assets/App.js'] }

    expect(flattenedImports(bundle, entry).code).toBe(
      'import "../assets/fallbacks.js";\nimport "../assets/runtime.js";\nimport "../assets/shared.js";',
    )
  })

  it('keeps a sibling specifier relative rather than climbing', () => {
    const flat = { 'assets/a.js': chunk(['assets/b.js']), 'assets/b.js': chunk() }
    const entry = { fileName: 'assets/entry.js', imports: ['assets/a.js'] }

    expect(flattenedImports(flat, entry).code).toBe('import "./b.js";')
  })
})
