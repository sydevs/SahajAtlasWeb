import { describe, expect, it } from 'vitest'

import { readSource, readSourceWithoutComments, sourceFiles, stripComments } from './source-tree'

/**
 * Nine specs inventory `src/` through this one walk, and most of them assert that a list of call
 * sites is CLOSED. A scope that quietly stopped matching would make every one of them pass by
 * vacuum, so each option is asserted to bite in both directions — the default leaves a named
 * file out, and the opt-in brings that same file back.
 *
 * ⚠ These are the walk's own properties. What each spec's scope has to BE stays at that spec.
 */
describe('the shared src/ walk', () => {
  it('finds the tree, relative and `/`-joined', () => {
    const files = sourceFiles()

    expect(files.length).toBeGreaterThan(200)
    expect(files).toContain('views/DrawerStack/DrawerStack.tsx')
  })

  it('leaves specs out by default, and takes them on request', () => {
    const spec = 'test-support/source-tree.test.ts'

    expect(sourceFiles()).not.toContain(spec)
    expect(sourceFiles({ includeSpecs: true })).toContain(spec)
  })

  it('leaves stories out by default, and takes them on request', () => {
    const story = 'components/atoms/Drawer/Drawer.stories.tsx'

    expect(sourceFiles()).not.toContain(story)
    expect(sourceFiles({ includeStories: true })).toContain(story)
  })

  it('drops declarations and the generated types on request', () => {
    expect(sourceFiles()).toContain('vite-env.d.ts')
    expect(sourceFiles({ includeDeclarations: false })).not.toContain('vite-env.d.ts')

    const generated = (paths: string[]) => paths.filter((path) => path.startsWith('types/payload/'))

    expect(generated(sourceFiles())).not.toEqual([])
    expect(generated(sourceFiles({ includeGeneratedTypes: false }))).toEqual([])
  })

  it('takes the extensions it is given, and no others', () => {
    expect(sourceFiles()).not.toContain('styles/globals.css')
    expect(sourceFiles({ extensions: ['.css'] })).toContain('styles/globals.css')
  })
})

describe('the comment strip two closed-list specs read through', () => {
  it('drops both comment forms, and keeps a protocol-relative literal', () => {
    expect(stripComments('keep /* drop */ keep2')).toBe('keep  keep2')
    expect(stripComments('keep // drop\nkeep2')).toBe('keep \nkeep2')
    // The `[^:]` guard. Without it a `//` inside a URL swallows the rest of the line.
    expect(stripComments("const u = 'https://x'")).toBe("const u = 'https://x'")
  })

  it('is what the stripped reader composes with the raw one', () => {
    expect(readSourceWithoutComments('App.tsx')).toBe(stripComments(readSource('App.tsx')))
  })
})

/**
 * `src/test-support/` is test-only code living under `src/`, which the bundler and `pnpm size`
 * are both blind to: an app module importing the walk would ship a `node:fs` directory walk to
 * every host page, and no other gate in the repo would say so. `Widget.standalone.test.ts`'s
 * graph walk cannot — `resolveModule` returns null for a bare `node:` specifier by design.
 *
 * Keeping the literal out of this file is deliberate, so the one-line regrowth check
 * `docs/testing.md` publishes still names the walker and nothing else.
 */
describe('nothing but a spec imports the test support', () => {
  it('has no importer outside `test-support/` and the specs', () => {
    const importers = sourceFiles()
      .filter((path) => !path.startsWith('test-support/'))
      .filter((path) => readSourceWithoutComments(path).includes('test-support'))

    expect(importers).toEqual([])
  })
})
