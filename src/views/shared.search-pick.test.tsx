import type { GeocodingFeature } from '@mapbox/search-js-core'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { SearchField } from './shared'

// Node-only SSR assertions (see `docs/testing.md`). The geocoder is a custom element that cannot
// mount here, so a stub stands in for it and keeps the `onRetrieve` the field handed it — calling
// that is what a pick does. The match itself is `searchedRegionRoute`, spec'd over a real region
// tree in `config/api/fetch.test.ts`; what this file drives is where the field sends the visitor
// once it has an answer.
const geocoder = vi.hoisted(() => ({
  picks: [] as ((value: GeocodingFeature) => void)[],
  match: undefined as { id: string; route: string } | undefined,
  routes: [] as string[],
}))

vi.mock('@mapbox/search-js-react', () => ({
  Geocoder: ({ onRetrieve }: { onRetrieve: (value: GeocodingFeature) => void }) => {
    geocoder.picks.push(onRetrieve)

    return null
  },
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/config/i18n', () => ({ default: { resolvedLanguage: 'en' } }))
vi.mock('@/hooks/use-locale', () => ({ useLocale: () => ({ locale: 'en' }) }))
vi.mock('@/hooks/use-mapbox', () => ({ useMapbox: () => ({ mapbox: undefined }) }))
vi.mock('@/hooks/use-atlas-navigate', () => ({
  useAtlasNavigate: () => (route: string) => geocoder.routes.push(route),
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: undefined }),
  useQueryClient: () => ({ getQueryData: () => [] }),
}))
vi.mock('@/config/api', () => ({
  default: {},
  clientQuery: () => ({ queryKey: ['client'] }),
  eventQuery: () => ({ queryKey: ['event'] }),
  regionQuery: () => ({ queryKey: ['region'] }),
  regionsQuery: () => ({ queryKey: ['regions'] }),
  geojsonQuery: () => ({ queryKey: ['geojson'] }),
  searchedRegionRoute: () => geocoder.match,
}))

// A picked feature reduced to what `handleSelect` reads.
const feature = (mapboxId: string): GeocodingFeature =>
  ({
    properties: {
      feature_type: 'neighborhood',
      mapbox_id: mapboxId,
      full_address: 'Somewhere',
      coordinates: { longitude: 4.4, latitude: 51.2 },
      context: { place: { mapbox_id: 'id-antwerp', name: 'Antwerpen' } },
    },
  }) as unknown as GeocodingFeature

const pickOn = (route: string, picked: GeocodingFeature, match?: { id: string; route: string }) => {
  geocoder.picks.length = 0
  geocoder.match = match
  geocoder.routes.length = 0
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[route]}>
      <SearchField />
    </MemoryRouter>,
  )

  // A field that never reached the stub would make every assertion below vacuous.
  if (geocoder.picks.length !== 1) throw new Error(`${geocoder.picks.length} geocoders mounted`)
  geocoder.picks[0](picked)

  return geocoder.routes
}

describe('SearchField — where a pick goes', () => {
  it('opens the page of the region the pick resolved to', () => {
    expect(
      pickOn('/belgium', feature('id-borgerhout'), {
        id: 'id-antwerp',
        route: '/belgium/antwerpen',
      }),
    ).toEqual(['/belgium/antwerpen'])
  })

  it('stays put when the pick IS the page it was made from', () => {
    expect(
      pickOn('/belgium/antwerpen', feature('id-antwerp'), {
        id: 'id-antwerp',
        route: '/belgium/antwerpen',
      }),
    ).toEqual([])
  })

  // A neighbourhood inside the town whose page this is resolves to that same page, so staying put
  // would answer a narrower pick with no navigation, no map move and no feedback at all.
  it('searches the point when only a CLIMBED candidate resolved to this page', () => {
    const [route, ...rest] = pickOn('/belgium/antwerpen', feature('id-borgerhout'), {
      id: 'id-antwerp',
      route: '/belgium/antwerpen',
    })

    expect(route).toMatch(/^\/search\?/)
    expect(route).toContain('center=4.4%2C51.2')
    expect(rest).toEqual([])
  })

  it('searches the point when no region matched', () => {
    const [route] = pickOn('/belgium/antwerpen', feature('id-borgerhout'))

    expect(route).toMatch(/^\/search\?/)
  })
})
