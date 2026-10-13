import { describe, expect, it } from 'vitest'

import { readSource, readSourceWithoutComments, sourceFiles } from './source-tree'

/**
 * Nine specs inventory `src/` through this one walk, and most of them assert that a list of call
 * sites is CLOSED. A scope that quietly stopped matching would make every one of them pass by
 * vacuum, so each option below is asserted to bite in both directions — the default leaves a
 * named file out, and the opt-in brings that same file back.
 *
 * ⚠ These are the walk's own properties. What each spec's scope has to BE stays at that spec,
 * beside the assertions it serves.
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
    expect(sourceFiles({ extensions: ['.css'] })).toEqual([
      'styles/base.css',
      'styles/globals.css',
      'styles/host-reset.css',
      'styles/vaul.css',
    ])
  })

  it('strips comments where a caller asks for it, and leaves the raw read alone', () => {
    const walker = 'test-support/source-tree.ts'
    const inAComment = 'The SCOPES stay with the specs'

    expect(readSource(walker)).toContain(inAComment)
    expect(readSourceWithoutComments(walker)).not.toContain(inAComment)

    // Two closed-list specs read only stripped source, so the strip must bite widely, not here alone.
    const files = sourceFiles()
    const stripped = files.filter((path) => readSourceWithoutComments(path) !== readSource(path))

    expect(stripped.length).toBeGreaterThan(files.length / 2)
  })
})
