import type { ReactNode } from 'react'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { RegionView } from './RegionView'

import { mockParentRegion } from '@/mocks/regions'

// Emptied, so the page also renders its empty state, the other place a search field lives.
const region = { ...mockParentRegion, subregions: [], events: [], onlineEvents: [] }

// Chrome is stubbed with markers, not nulls, so order can be read off the markup.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useSuspenseQuery: () => ({ data: region }),
}))
vi.mock('@/config/api', () => ({ regionQuery: () => ({ queryKey: ['region'] }) }))
vi.mock('@/hooks/use-locale', () => ({ useLocale: () => ({ locale: 'en' }) }))
vi.mock('@/hooks/use-prefetch-event', () => ({ usePrefetchEvents: () => {} }))
vi.mock('@/components/atoms/Drawer', () => ({
  DrawerBody: ({ children }: { children: ReactNode }) => <section>body:{children}</section>,
  DrawerToolbar: ({ children, field }: { children: ReactNode; field?: boolean }) => (
    <aside>
      {field ? 'field-toolbar' : 'toolbar'}:{children}
    </aside>
  ),
}))
vi.mock('@/components/molecules', () => ({ ActiveFilterPills: () => null }))
vi.mock('@/views/nav', () => ({
  NavHeader: ({ title, actions }: { title: ReactNode; actions: ReactNode }) => (
    <header>
      <h2>{title}</h2>
      {actions}
    </header>
  ),
}))
vi.mock('@/views/shared', () => ({
  CalendarButton: () => <i>calendar-button</i>,
  EmptyEventList: ({ hasSearchChrome }: { hasSearchChrome?: boolean }) =>
    hasSearchChrome ? <i>empty-list</i> : <i>empty-list-with-search-field</i>,
  FilterButton: () => <i>filter-button</i>,
  GeolocationSuggestion: () => null,
  SearchField: () => <i>search-field</i>,
  useFrameOnTop: () => {},
}))

describe('RegionView — search on a place page', () => {
  it('puts one search field in a toolbar under the header, and no search icon in it', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <RegionView slug={region.slug} />
      </MemoryRouter>,
    )

    expect(markup).toMatch(
      /<header><h2>[^<]*<\/h2><i>calendar-button<\/i><i>filter-button<\/i><\/header><aside>field-toolbar:<i>search-field<\/i><\/aside><section>body:.*<i>empty-list<\/i>/,
    )
    expect(markup).not.toContain('empty-list-with-search-field')
  })
})
