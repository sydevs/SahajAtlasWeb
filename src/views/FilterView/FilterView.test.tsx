import type { EventFilters } from '@/lib/shape'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { FilterView } from './FilterView'

// Node-only SSR assertions (see `docs/testing.md`). What is under test is the scope the drawer
// opens with, which the form stub prints, and the footer.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: undefined }),
}))
vi.mock('@/config/api', () => ({ default: {} }))
vi.mock('@/hooks/use-filter-facets', () => ({ useFilterFacets: () => undefined }))
vi.mock('./WhereFilter', () => ({ WhereFilter: () => null }))
vi.mock('./RecoveryButton', () => ({ RecoveryButton: () => null }))
vi.mock('@/components/molecules', () => ({
  SearchFilters: ({ value }: { value: EventFilters }) => <i>draft-region:{value.region ?? '∅'}</i>,
}))
vi.mock('@/views/shared', () => ({
  CloseButton: () => null,
  DrawerTitle: () => null,
  useDrawerControl: () => ({ dismiss: () => {} }),
}))
vi.mock('@/hooks/use-map-controller', () => ({
  useMapController: () => ({ frameSearch: () => {}, reset: () => {} }),
}))

const view = (entry: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[entry]}>
      <FilterView />
    </MemoryRouter>,
  )

describe('FilterView — the scope it opens with', () => {
  it('is scoped to the region it was opened over', () => {
    expect(view('/gb/london/filters')).toContain('draft-region:london')
  })

  it('keeps a region the URL already applies', () => {
    expect(view('/gb/london/filters?region=gb')).toContain('draft-region:gb')
  })

  it('is unscoped over the country list', () => {
    expect(view('/filters')).toContain('draft-region:∅')
  })
})

describe('FilterView — the footer', () => {
  it('has no Clear with nothing to clear', () => {
    expect(view('/gb/filters')).not.toContain('filters.chrome.clear_one')
  })

  it('says Close, not a count, when closing would only go back', () => {
    expect(view('/gb/filters')).toContain('common.chrome.close')
    expect(view('/filters?days=2')).not.toContain('common.chrome.close')
  })

  it('offers Clear once a filter is set', () => {
    expect(view('/filters?days=2')).toContain('filters.chrome.clear_one')
  })
})
