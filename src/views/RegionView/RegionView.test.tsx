import type { ReactNode } from 'react'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { RegionView } from './RegionView'

import { mockParentRegion } from '@/mocks/regions'

// Emptied, so the page also renders its empty state, which must not draw a second field.
const region = { ...mockParentRegion, subregions: [], events: [], onlineEvents: [] }
let shown: typeof region = region
let framed: typeof region | undefined
const frameRegion = vi.fn()

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
vi.mock('@/hooks/use-map-controller', () => ({
  useMapController: () => ({ hasMap: true, frameRegion }),
}))
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
  // Framing is a render-body call here, so the callback runs under `renderToStaticMarkup` and
  // the spy below reads what the view asked the camera for.
  useFrameOnTop: (frame: (opts: { isEntry: boolean }) => void) => frame({ isEntry: true }),
  useFrameableRegion: () => framed,
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

describe('RegionView — framing a region the camera cannot fit', () => {
  const render = () =>
    renderToStaticMarkup(
      <MemoryRouter>
        <RegionView slug={region.slug} />
      </MemoryRouter>,
    )

  it('frames the ancestor the climb found, not the region with no bounds of its own', () => {
    shown = { ...region, bounds: null, center: null }
    framed = { ...region, slug: 'belgium', bounds: [2, 49, 7, 52] } as typeof region
    frameRegion.mockClear()

    render()

    expect(frameRegion).toHaveBeenCalledWith(framed)
  })

  it('frames the region itself when nothing above it can be fitted either', () => {
    shown = { ...region, bounds: null, center: null }
    framed = undefined
    frameRegion.mockClear()

    render()

    // Not a skipped call: `frameRegion` is also what drops the boundary and the pin the previous
    // view left on the map, and a region with no bounds reaches exactly that branch.
    expect(frameRegion).toHaveBeenCalledWith(shown)
  })
})
