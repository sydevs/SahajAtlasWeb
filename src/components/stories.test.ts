import { describe, expect, it } from 'vitest'

import { sourceFiles } from '@/test-support/source-tree'

/**
 * `DESIGN_SYSTEM.md` § Previews: every atom, molecule and organism folder has a co-located
 * `<Name>.stories.tsx`. As prose alone, the rule let new component folders ship without one,
 * and nothing else notices: `pnpm ladle:build` builds the stories that exist, never the ones
 * that don't. So the folders without a story are a closed list here, each with the reason a
 * preview would show nothing.
 */

// Stories are the subject, so they stay in scope.
const FILES = sourceFiles({ includeStories: true })

const FOLDER = /^components\/(?:atoms|molecules|organisms)\/[^/]+(?=\/)/

/** `<tier>/<Name>` for every component folder, from the files inside them. */
const FOLDERS = [
  ...new Set(FILES.flatMap((path) => FOLDER.exec(path)?.[0].slice('components/'.length) ?? [])),
].sort()

const NO_STORY: Record<string, string> = {
  'molecules/EventMetadata': 'renders only <head> tags, which a preview canvas never shows',
  'molecules/ResultCountStatus': 'renders only a visually hidden live region, for screen readers',
}

const hasStory = (folder: string) => {
  const name = folder.split('/')[1]

  return FILES.includes(`components/${folder}/${name}.stories.tsx`)
}

describe('component previews', () => {
  it('is a real scan — the walk found the component folders', () => {
    // A path change that emptied this list would otherwise pass every assertion below by vacuum.
    expect(FOLDERS).toContain('atoms/Chip')
    expect(FOLDERS).toContain('organisms/Mapbox')
    expect(FOLDERS.length).toBeGreaterThan(40)
  })

  it('gives every component folder a co-located story, or a stated reason it has none', () => {
    const missing = FOLDERS.filter((folder) => !(folder in NO_STORY) && !hasStory(folder))

    // Compared as a list, so a failure names the folder rather than a count.
    expect(missing).toEqual([])
  })

  it('lists no exception that has a story or no folder any more', () => {
    const stale = Object.keys(NO_STORY).filter(
      (folder) => !FOLDERS.includes(folder) || hasStory(folder),
    )

    expect(stale).toEqual([])
  })
})
