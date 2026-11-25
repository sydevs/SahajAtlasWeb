import type { ReactNode } from 'react'
import type { Region } from '@/types'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { RegionView } from './RegionView'

// Node-only SSR assertions (see `docs/testing.md`). What is under test is where a place page puts
// its search: the field in the fixed toolbar between the header and the scrolling body, and no
// search icon among the header's controls. The chrome is stubbed with MARKERS, so both the
// presence and the order can be read off the markup, and `SearchButton` stays in the stub so a
// header that still mounted it would print it.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const { region } = vi.hoisted(() => ({
  region: {
    id: 1,
    slug: 'south-east',
    name: 'South East',
    level: 'region',
    eventCount: 3,
    bounds: null,
    center: null,
    path: '/gb/south-east',
    subregions: [
      { id: 2, slug: 'brighton', name: 'Brighton', eventCount: 3, path: '/gb/south-east/brighton' },
    ],
    events: [],
    onlineEvents: [],
  } as unknown as Region,
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useSuspenseQuery: () => ({ data: region }),
}))
vi.mock('@/config/api', () => ({ regionQuery: () => ({ queryKey: ['region'] }) }))
vi.mock('@/config/mode', () => ({ useWidgetMode: () => ({ standalone: false }) }))
vi.mock('@/hooks/use-filters', () => ({
  useEventFilters: () => ({}),
  useFilterSearch: () => '',
  useSetFilters: () => ({ setFilters: () => {} }),
}))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en', regionNames: { of: () => undefined } }),
}))
vi.mock('@/hooks/use-map-controller', () => ({
  useMapController: () => ({ frameRegion: () => {} }),
}))
vi.mock('@/hooks/use-post-event-feedback', () => ({
  usePostEventFeedback: () => ({ answer: undefined, dismiss: () => {} }),
}))
vi.mock('@/hooks/use-prefetch-event', () => ({ usePrefetchEvents: () => {} }))
vi.mock('@/components/atoms/Drawer', () => ({
  DrawerBody: ({ children }: { children: ReactNode }) => <section>body:{children}</section>,
  DrawerToolbar: ({ children }: { children: ReactNode }) => <aside>toolbar:{children}</aside>,
}))
vi.mock('@/components/molecules', () => ({
  ActiveFilterPills: () => null,
  EventListItem: () => <i>event</i>,
  FallbackPanel: () => null,
  List: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
  ListItem: ({ label }: { label: string }) => <li>{label}</li>,
}))
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
  EmptyEventList: () => null,
  FilterButton: () => <i>filter-button</i>,
  GeolocationSuggestion: () => null,
  SearchButton: () => <i>search-button</i>,
  SearchField: () => <i>search-field</i>,
  useFrameOnTop: () => {},
}))

const view = () =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/gb/south-east']}>
      <RegionView slug="south-east" />
    </MemoryRouter>,
  )

describe('RegionView — search on a place page', () => {
  it('puts the search field in the toolbar, under the header and above the list', () => {
    const markup = view()
    const header = markup.slice(markup.indexOf('<header>'), markup.indexOf('</header>'))

    expect(markup).toMatch(/<\/header><aside>toolbar:.*search-field.*<\/aside><section>body:/)
    expect(header).not.toContain('search-field')
  })

  it('drops the header search icon and keeps the calendar and filter controls', () => {
    const markup = view()
    const header = markup.slice(markup.indexOf('<header>'), markup.indexOf('</header>'))

    expect(markup).not.toContain('search-button')
    expect(header).toContain('calendar-button')
    expect(header).toContain('filter-button')
  })
})
