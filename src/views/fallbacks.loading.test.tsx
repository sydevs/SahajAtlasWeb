import type { ReactElement } from 'react'
import type { RegionNode } from '@/types'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { DrawerLoading } from './fallbacks'

import { ClassHeader } from '@/components/organisms/EventDetails/EventHeader'
import { eventQuery, regionsQuery } from '@/config/api'
import { GEOJSON_QUERY_KEY } from '@/config/api/fetch'
import { CountriesHeader } from '@/views/CountriesView/CountriesHeader'
import { RegionHeader } from '@/views/RegionView/RegionHeader'

// Node-only SSR assertions (see `docs/testing.md`): what each loading placeholder draws before
// its page arrives, with the views' own header components rendered for real. i18next echoes the
// key, the drawer's slots are plain boxes, and the list skeleton prints which kind it was asked
// for. The geocoder modules `views/shared` pulls in are stood in for at the vendor boundary.
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({
    locale: 'en',
    regionNames: new Intl.DisplayNames(['en'], { type: 'region' }),
  }),
}))
vi.mock('@/components/atoms/Drawer', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>

  return { DrawerBody: Pass, DrawerHeader: Pass, DrawerToolbar: Pass }
})
vi.mock('@/components/molecules', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/molecules')>()),
  ListSkeleton: ({ variant = 'places' }: { variant?: string }) => <i data-list={variant} />,
}))
vi.mock('@mapbox/search-js-react', () => ({ Geocoder: () => null }))
vi.mock('react-map-gl', () => ({ useMap: () => ({}) }))

const node = (
  id: number,
  slug: string,
  level: RegionNode['level'],
  parent?: number,
  subtitle?: string,
) => ({ id, slug, name: slug, level, parent, subtitle }) as RegionNode

const TREE = [
  node(1, 'gb', 'country'),
  node(2, 'south-east', 'region', 1),
  node(3, 'london', 'city', 2),
  node(4, 'prague', 'city', undefined, 'Classes across Prague'),
]

type Cache = { tree?: RegionNode[]; set?: (client: QueryClient) => void }

const render = (path: string, ui: ReactElement, { tree, set }: Cache = {}) => {
  const client = new QueryClient()

  if (tree) client.setQueryData(regionsQuery().queryKey, tree)
  set?.(client)

  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  )
}

const loading = (path: string, cache?: Cache) => {
  const html = render(path, <DrawerLoading />, cache)

  return {
    html,
    list: html.match(/data-list="(\w+)"/)?.[1],
    title: html.match(/<h2[^>]*>([^<]*)<\/h2>/)?.[1],
  }
}

// The location line under the field (`FieldSkeleton prompt`).
const PROMPT = 'bg-secondary-3'
// The title's placeholder line (`TitleSkeleton`).
const TITLE_BAR = 'flex h-7 items-center'

describe('the first screen loading', () => {
  it("draws CountriesView's own header, then its field with the location line and flagged rows", () => {
    const { html } = loading('/')

    expect(html.startsWith(render('/', <CountriesHeader />))).toBe(true)
    expect(html).toContain(PROMPT)
    expect(html).toContain('data-list="places"')
  })
})

describe('a place loading', () => {
  it('draws class cards for a city and place rows above it, once the region tree is in', () => {
    expect(loading('/gb/south-east/london', { tree: TREE }).list).toBe('classes')
    expect(loading('/cz/prague', { tree: TREE }).list).toBe('classes')
    expect(loading('/gb/south-east', { tree: TREE }).list).toBe('places')
    expect(loading('/gb', { tree: TREE }).list).toBe('places')
  })

  it('guesses from the route before the tree arrives', () => {
    expect(loading('/gb/south-east/london').list).toBe('classes')
    expect(loading('/gb/south-east').list).toBe('places')
  })

  it('names a country at once, without the region tree', () => {
    expect(loading('/gb').title).toBe('United Kingdom')
  })

  it('holds the title’s line with a placeholder until the name is known', () => {
    const { html, title } = loading('/gb/south-east')

    expect(title).toBeUndefined()
    expect(html).toContain(TITLE_BAR)
  })

  // The header used to be a hand-made copy that left the subtitle out, so it grew a line when
  // the page arrived.
  it("draws RegionView's own header, with the line under the name the page will show", () => {
    const city = loading('/gb/south-east/london', { tree: TREE }).html
    const ownSubtitle = loading('/cz/prague', { tree: TREE }).html
    const places = loading('/gb/south-east', { tree: TREE }).html
    const view = render(
      '/gb/south-east/london',
      <RegionHeader listsClasses level="city" slug="london" title="london" />,
      { tree: TREE },
    )

    expect(city).toContain('common.chrome.all_classes_free')
    expect(ownSubtitle).toContain('Classes across Prague')
    expect(places).not.toContain('common.chrome.all_classes_free')
    expect(city.startsWith(view)).toBe(true)
  })

  it('offers the location line on a country only when the cached guess leads somewhere', () => {
    const guess = (client: QueryClient) => {
      client.setQueryData(['ip-location'], {
        city: 'Prague',
        country: 'Czechia',
        country_code: 'CZ',
        latitude: 50.08,
        longitude: 14.43,
      })
      client.setQueryData(GEOJSON_QUERY_KEY, {
        type: 'FeatureCollection',
        features: [{ geometry: { type: 'Point', coordinates: [14.42, 50.09] }, properties: {} }],
      })
    }

    // No guess yet: the page shows none either, until its own lookup lands.
    expect(loading('/gb').html).not.toContain(PROMPT)
    // A guess in another country, with classes near it: the page offers it.
    expect(loading('/gb', { set: guess }).html).toContain(PROMPT)
    // The visitor's own country is already the answer.
    expect(loading('/cz', { set: guess }).html).not.toContain(PROMPT)
    // Below a country, never.
    expect(loading('/gb/south-east', { set: guess }).html).not.toContain(PROMPT)
  })
})

describe('a class loading', () => {
  it("draws EventView's own header with the title it can already tell", () => {
    const set = (client: QueryClient) =>
      client.setQueryData(eventQuery(1207, 'en').queryKey, { title: 'Evening meditation' })
    const { html } = loading('/gb/south-east/london/1207', { set })
    const view = render('/gb/south-east/london/1207', <ClassHeader title="Evening meditation" />)

    expect(html).toContain('<h1 class="line-clamp-3 text-xl break-words">Evening meditation</h1>')
    // The view's header, less the Back row the loading state passes in as `nav`.
    expect(html).toContain(view.replace('<div>', ''))
  })

  it('holds two placeholder lines where the title will go when nothing has it', () => {
    const { html } = loading('/gb/south-east/london/1207')

    expect(html).not.toContain('<h1')
    expect(html.split(TITLE_BAR)).toHaveLength(3)
  })
})
