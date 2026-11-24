import type { ReactNode } from 'react'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { RegionView } from './RegionView'

import { mockCityWithVenuesRegion } from '@/mocks/regions'

// Node-only SSR assertions (see `docs/testing.md`). The real ListItem renders, since the
// subtitle line is what it would draw; the header chrome and the data hooks are stubbed.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/config/i18n', () => ({ default: { resolvedLanguage: 'en' } }))
vi.mock('@/config/api', () => ({ regionQuery: () => ({}) }))
vi.mock('react-helmet-async', () => ({ Helmet: () => null }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSuspenseQuery: () => ({ data: region }),
}))
vi.mock('@/components/atoms/Drawer', () => ({
  DrawerBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerHeader: () => null,
}))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en', regionNames: { of: () => undefined } }),
}))
vi.mock('@/hooks/use-filters', () => ({
  useEventFilters: () => ({}),
  useFilterSearch: () => '',
  useSetFilters: () => ({ setFilters: () => {} }),
}))
vi.mock('@/hooks/use-map-controller', () => ({
  useMapController: () => ({ frameRegion: () => {}, highlightEvent: () => {} }),
}))
vi.mock('@/hooks/use-post-event-feedback', () => ({
  usePostEventFeedback: () => ({ answer: null, dismiss: () => {} }),
}))
vi.mock('@/hooks/use-prefetch-event', () => ({
  usePrefetchEvents: () => {},
  useHoverPrefetch: () => ({ enter: () => {}, leave: () => {} }),
}))
vi.mock('@/config/mode', () => ({ useWidgetMode: () => ({ standalone: false }) }))
vi.mock('@/components/molecules/ActiveFilterPills', () => ({ ActiveFilterPills: () => null }))
vi.mock('@/components/molecules/EventListItem', () => ({ EventListItem: () => null }))
vi.mock('@/views/shared', () => ({
  CalendarButton: () => null,
  CloseButton: () => null,
  DrawerTitle: () => null,
  EmptyEventList: () => null,
  FilterButton: () => null,
  GeolocationSuggestion: () => null,
  SearchButton: () => null,
  useFrameOnTop: () => {},
}))

const SUBTITLE = 'Learn to Meditate'
const region = {
  ...mockCityWithVenuesRegion,
  events: [],
  onlineEvents: [],
  subregions: mockCityWithVenuesRegion.subregions.map((child) => ({
    ...child,
    subtitle: SUBTITLE,
  })),
}

describe('place rows on a region page', () => {
  it('show the name and count, never the SahajCloud subtitle', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <RegionView slug={region.slug} />
      </MemoryRouter>,
    )
    const [first] = region.subregions

    expect(html).toContain(first.name)
    expect(html).toContain(`>${first.eventCount}<`)
    expect(html).not.toContain(SUBTITLE)
  })
})
