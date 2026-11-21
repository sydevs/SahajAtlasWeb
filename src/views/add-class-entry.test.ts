import { describe, expect, it } from 'vitest'

import { readRepoSource } from '@/test-support/repo-source'

// The wiring half, as `DynamicEventsList.test.ts` reads it: each list mounts behind a suspense
// read and a map, and the defect worth catching is a list that stops offering the add-a-class
// flow, or offers it without its place. Comments and whitespace are stripped first, so a
// comment naming the call cannot satisfy it.
const wiring = (path: string) =>
  readRepoSource(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/\s+/g, '')

describe('the add-a-class entry', () => {
  it('is offered with no place in context under the results and the country index', () => {
    for (const path of [
      'src/components/organisms/EventsList/DynamicEventsList.tsx',
      'src/views/CountriesView/CountriesView.tsx',
    ]) {
      expect(wiring(path)).toContain("href={addClassPath()}>{t('submit.chrome.add_entry')}")
    }
  })

  it('opens over the region on a region or venue page, so the search starts near it', () => {
    expect(wiring('src/views/RegionView/RegionView.tsx')).toContain(
      "href={addClassPath(region.path)}>{t('submit.chrome.add_here')}",
    )
  })

  it('offers a correction on a class page', () => {
    expect(wiring('src/views/EventView/EventView.tsx')).toContain(
      "href={correctionPath(basePath)}>{t('submit.chrome.correct_entry')}",
    )
  })
})
