import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { AddClassLink } from './AddClassLink'

import { readRepoSource } from '@/test-support/repo-source'

// The wiring half reads SOURCE, as `DynamicEventsList.test.ts` does: each list mounts behind a
// suspense read and a map, and the defect worth catching is a list that stops offering the
// flow, or offers it without its place. Comments and whitespace are stripped first, so a
// comment naming the call cannot satisfy it.
const wiring = (path: string) =>
  readRepoSource(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/\s+/g, '')

describe('AddClassLink', () => {
  it('links to the flow it is given', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AddClassLink href="/gb/london/add" label="Add a class here" />
      </MemoryRouter>,
    )

    expect(html).toMatch(/<a[^>]*href="[^"]*\/gb\/london\/add"/)
    expect(html).toContain('Add a class here')
  })

  it('is offered with no place in context under the results and the country index', () => {
    for (const path of [
      'src/components/organisms/EventsList/DynamicEventsList.tsx',
      'src/views/CountriesView/CountriesView.tsx',
    ]) {
      expect(wiring(path)).toContain(
        "<AddClassLinkhref={addClassPath()}label={t('submit.chrome.add_entry')}/>",
      )
    }
  })

  it('opens over the region on a region or venue page, so the search starts near it', () => {
    expect(wiring('src/views/RegionView/RegionView.tsx')).toContain(
      "<AddClassLinkhref={addClassPath(region.path)}label={t('submit.chrome.add_here')}/>",
    )
  })
})
