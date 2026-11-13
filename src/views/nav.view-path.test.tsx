import type { RegionNode } from '@/types'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { NavHeader } from './nav'

import { regionsQuery } from '@/config/api'
import { WidgetWidthContext } from '@/config/responsive'
import { DrawerControlContext, useDrawerControl } from '@/views/shared'

// Node-only SSR (see `docs/testing.md`). On a wide map the add-a-class flow docks over the page it
// opened from, so the address names the flow while the panel still shows that page: its Back and
// breadcrumbs must name the page's own parents (`DrawerControl.viewPath`).
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (key: string, values?: { title?: string }) =>
      values?.title ? `${key}: ${values.title}` : key,
    i18n: { language: 'en' },
  }),
}))
vi.mock('@mapbox/search-js-react', () => ({ Geocoder: () => null }))
vi.mock('react-map-gl', () => ({ useMap: () => ({}) }))

const TREE = [
  { id: 1, slug: 'gb', name: 'United Kingdom', level: 'country' },
  { id: 2, slug: 'south-east', name: 'South East', level: 'region', parent: 1 },
  { id: 3, slug: 'london', name: 'London', level: 'city', parent: 2 },
] as RegionNode[]

function Header({ viewPath }: { viewPath?: string }) {
  const control = useDrawerControl()

  return (
    <DrawerControlContext.Provider value={{ ...control, viewPath }}>
      <NavHeader breadcrumbs title="London" />
    </DrawerControlContext.Provider>
  )
}

const render = (viewPath?: string) => {
  const client = new QueryClient()

  client.setQueryData(regionsQuery().queryKey, TREE)

  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/gb/south-east/london/add?step=time']}>
      <QueryClientProvider client={client}>
        <WidgetWidthContext.Provider value={true}>
          <Header viewPath={viewPath} />
        </WidgetWidthContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('a page behind the docked add-a-class panel', () => {
  it("names the page's own parent on Back, not the page itself", () => {
    const html = render('/gb/south-east/london')

    expect(html).toContain('common.chrome.back_to: South East')
    expect(html).not.toContain('common.chrome.back_to: London')
  })

  it('leaves the page itself out of its breadcrumbs', () => {
    const html = render('/gb/south-east/london')

    expect(html).toContain('href="/gb/south-east"')
    expect(html).not.toContain('href="/gb/south-east/london"')
  })

  it('reads the address where the drawer shows all of it', () => {
    expect(render()).toContain('common.chrome.back_to: London')
  })
})
