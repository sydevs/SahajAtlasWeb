import type { ReactNode } from 'react'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { RegionView } from './RegionView'

import { mockParentRegion } from '@/mocks/regions'

// Emptied, so the page also renders its empty state, which must not draw a second field.
const region = { ...mockParentRegion, subregions: [], events: [], onlineEvents: [] }
let shown: typeof region = region

// Chrome is stubbed with markers, not nulls, so order can be read off the markup.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useSuspenseQuery: () => ({ data: shown }),
}))
vi.mock('@/config/api', () => ({ regionQuery: () => ({ queryKey: ['region'] }) }))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({
    locale: 'en',
    formatLocale: 'en-US',
    regionNames: { of: (code: string) => code },
  }),
}))
vi.mock('@/hooks/use-prefetch-event', () => ({ usePrefetchEvents: () => {} }))
vi.mock('@/components/atoms/Drawer', () => ({
  DrawerBody: ({ children }: { children: ReactNode }) => <section>body:{children}</section>,
  DrawerToolbar: ({ children, field }: { children: ReactNode; field?: boolean }) => (
    <aside>
      {field ? 'field-toolbar' : 'toolbar'}:{children}
    </aside>
  ),
}))
vi.mock('@/components/molecules', () => ({
  ActiveFilterChips: () => null,
  FallbackPanel: ({ hasSearchChrome }: { hasSearchChrome?: boolean }) => (
    <i>{hasSearchChrome ? 'panel' : 'panel-with-search-field'}</i>
  ),
}))
vi.mock('@/components/organisms', () => ({ FilterNotice: () => <i>filter-notice</i> }))
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
  FilterButton: () => <i>filter-button</i>,
  SearchField: ({ near }: { near?: { level: string } }) => (
    <i>search-field{near ? ` near:${near.level}` : ''}</i>
  ),
  useFrameOnTop: () => {},
}))

describe('RegionView — search on a place page', () => {
  it('puts one search field in a toolbar under a header of calendar and filters', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <RegionView slug={region.slug} />
      </MemoryRouter>,
    )

    expect(markup).toMatch(
      /<header><h2>[^<]*<\/h2><i>calendar-button<\/i><i>filter-button<\/i><\/header><aside>field-toolbar:<i>search-field[^<]*<\/i><\/aside><section>body:.*<i>panel<\/i>/,
    )
    expect(markup).not.toContain('panel-with-search-field')
  })
})

describe('RegionView — the location line under the search', () => {
  // Where the line shows is `locationLineHere`'s, spec'd beside it; the page hands its region over.
  it('hands its region to the search', () => {
    shown = { ...region, level: 'country', countryCode: 'GB' } as typeof region

    expect(
      renderToStaticMarkup(
        <MemoryRouter>
          <RegionView slug={region.slug} />
        </MemoryRouter>,
      ),
    ).toContain('search-field near:country')
  })
})
