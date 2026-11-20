import { describe, expect, it } from 'vitest'

import flattenEntryImports, { flattenedImports, importClosure } from './flatten-entry-imports.mjs'

/**
 * The plugin exists so `embed.js` declares its whole eager graph, the same
 * way Vite's modulepreload list does for `index.html`. Two things can
 * silently go wrong. The graph walk can miss a chunk — that chunk stays a
 * round trip late, with byte-identical output, so `pnpm size` cannot see
 * the regression. The specifier math can break, but only when
 * `entryFileNames` moves the entry out of the output root. This spec pins
 * both cases. See issue #96.
 */
const chunk = (imports: string[] = []) => ({ type: 'chunk', imports })

// This matches the real bundle shape as of this writing. The entry
// imports most chunks directly, but `shared` and `fallbacks` hang off
// `App`. `shared` is the largest chunk in the payload.
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

  // The entry sits at the output root today. `entryFileNames` is free to
  // move it. A specifier that is wrong by one directory would 404 for a
  // third of the payload.
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

// The two functions above are only as good as the hook that calls them, and the hook rests on
// what rolldown names things: it finds its entry by `isEntry` and `name` (the input KEY, not the
// filename) and tells a hashed filename by its shape. The build passes either way — flattening
// changes discovery, not bytes — so nothing but this says the hook still does its work.
describe('flattenEntryImports', () => {
  type Hook = (this: { error(message: string): never }, options: object, output: object) => void

  /** Runs the hook as rolldown does. `this.error` throws there too, which is what fails a build. */
  const generate = (entryName: string, output: Record<string, object>) => {
    const hook = flattenEntryImports(entryName).generateBundle as unknown as Hook
    const error = (message: string): never => {
      throw new Error(message)
    }

    hook.call({ error }, {}, output)
  }

  const CODE = 'import{t}from"./assets/App.js";t();'

  /** An entry as rolldown's `OutputChunk` describes it, reaching three chunks through one. */
  const entry = (fields: object = {}) => ({
    type: 'chunk',
    isEntry: true,
    name: 'loader',
    fileName: 'loader.js',
    imports: ['assets/App.js'],
    code: CODE,
    ...fields,
  })

  it('appends what the entry reaches indirectly, to its code and to its import list', () => {
    const loader = entry()

    generate('loader', { ...bundle, 'loader.js': loader })

    expect(loader.code).toBe(
      `${CODE}\nimport "./assets/fallbacks.js";\nimport "./assets/runtime.js";\nimport "./assets/shared.js";\n`,
    )
    expect(loader.imports).toEqual([
      'assets/App.js',
      'assets/fallbacks.js',
      'assets/runtime.js',
      'assets/shared.js',
    ])
  })

  it('leaves an entry that imports its whole closure byte for byte', () => {
    const loader = entry({ imports: ['assets/runtime.js'] })

    generate('loader', { ...bundle, 'loader.js': loader })

    expect(loader).toEqual(entry({ imports: ['assets/runtime.js'] }))
  })

  // Silence here would revert the whole optimisation with every gate green.
  it('fails the build when no entry carries the input key', () => {
    expect(() => generate('widget', { ...bundle, 'loader.js': entry() })).toThrow(
      /no entry chunk named "widget"/,
    )
  })

  it('does not take a lazy chunk of the same name for the entry', () => {
    const lazy = entry({ isEntry: false, fileName: 'assets/loader-BbhIzGzF.js' })

    expect(() => generate('loader', { ...bundle, [lazy.fileName]: lazy })).toThrow(
      /no entry chunk named "loader"/,
    )
  })

  // `generateBundle` runs after hashing, so appending here would ship bytes the hash in the
  // filename no longer describes, under a URL served as immutable for a year.
  it.each(['assets/loader-BbhIzGzF.js', 'assets/loader--2LVzWk4.js', 'assets/loader-CoraX_2-.js'])(
    'refuses to rewrite the hash-named %s',
    (fileName) => {
      const hashed = entry({ fileName })

      expect(() => generate('loader', { ...bundle, [fileName]: hashed })).toThrow(
        /refusing to rewrite hash-named/,
      )
      expect(hashed.code).toBe(CODE)
    },
  )

  it.each(['auto.js', 'loader.js', 'embed.js'])('rewrites the stable name %s', (fileName) => {
    const stable = entry({ fileName })

    generate('loader', { ...bundle, [fileName]: stable })

    expect(stable.imports).toHaveLength(4)
  })
})
