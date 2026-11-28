import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { type FilterSurface, useFilterEditor } from './use-filter-editor'

// Node-only SSR: a probe reads the hook under a real router at a given address.
const editorAt = (path: string, surface: FilterSurface) => {
  let editor: ReturnType<typeof useFilterEditor> | undefined
  const Probe = () => {
    editor = useFilterEditor(surface)

    return null
  }

  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Probe />
    </MemoryRouter>,
  )

  return editor!
}

describe('useFilterEditor', () => {
  it('reads a place page as its own scope, without the URL naming it', () => {
    expect(editorAt('/gb/filters', 'drawer').filters.region).toBe('gb')
    expect(editorAt('/gb', 'buttons').filters.region).toBe('gb')
    expect(editorAt('/search?region=fr', 'buttons').filters.region).toBe('fr')
  })

  it('offers Near me everywhere but the calendar, judged by the page the filters narrow', () => {
    expect(editorAt('/search', 'buttons').where.searchable).toBe(true)
    expect(editorAt('/calendar', 'buttons').where.searchable).toBe(false)
    expect(editorAt('/search/filters', 'drawer').where.searchable).toBe(true)
    expect(editorAt('/calendar/filters', 'drawer').where.searchable).toBe(false)
  })
})
