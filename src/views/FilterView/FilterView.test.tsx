import type { EventFilters } from '@/lib/shape'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { FilterView } from './FilterView'

// Node-only SSR assertions (see `docs/testing.md`). What is under test is the draft the
// drawer opens with, which the form stub prints, and the footer that draft earns.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: undefined }),
}))
vi.mock('@/config/api', () => ({ default: {} }))
vi.mock('@/hooks/use-region-matcher', () => ({ useRegionMatcher: () => undefined }))
vi.mock('@/components/molecules', () => ({
  SearchFilters: ({ value }: { value: EventFilters }) => <i>draft-region:{value.region ?? '∅'}</i>,
}))
vi.mock('@/views/shared', () => ({
  CloseButton: () => null,
  DrawerTitle: () => null,
}))

const view = (entry: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[entry]}>
      <FilterView />
    </MemoryRouter>,
  )

describe('FilterView — the draft it opens with', () => {
  it('starts scoped to the region it was opened over, ready to apply', () => {
    const markup = view('/gb/london/filters')

    expect(markup).toContain('draft-region:london')
    expect(markup).toContain('filters.chrome.apply')
  })

  it('keeps a region the URL already applies', () => {
    expect(view('/gb/london/filters?region=gb')).toContain('draft-region:gb')
  })

  it('starts unscoped over the country list, with nothing to apply', () => {
    const markup = view('/filters')

    expect(markup).toContain('draft-region:∅')
    expect(markup).not.toContain('filters.chrome.apply')
  })
})
