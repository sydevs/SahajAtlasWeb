import type { GeocodingOptions } from '@mapbox/search-js-core'
import type { ReactNode } from 'react'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { MapSearch } from './MapSearch'

import { SearchField } from '@/views/shared'

// Node-only SSR assertions (see `docs/testing.md`). The geocoder is a custom element that cannot
// mount here, so it is stood in for by a stub recording the options it was handed — the request
// Mapbox will receive.
const geocoder = vi.hoisted(() => ({ mounts: [] as Partial<GeocodingOptions>[], locale: 'en' }))

vi.mock('@mapbox/search-js-react', () => ({
  Geocoder: ({ options }: { options: Partial<GeocodingOptions> }) => {
    geocoder.mounts.push(options)

    return null
  },
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/config/i18n', () => ({ default: { resolvedLanguage: 'en' } }))
vi.mock('@/hooks/use-locale', () => ({ useLocale: () => ({ locale: geocoder.locale }) }))
vi.mock('@/hooks/use-mapbox', () => ({ useMapbox: () => ({ mapbox: undefined }) }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: undefined }),
}))
vi.mock('@/config/api', () => ({
  default: {},
  clientQuery: () => ({ queryKey: ['client'] }),
  eventQuery: () => ({ queryKey: ['event'] }),
  regionQuery: () => ({ queryKey: ['region'] }),
  regionsQuery: () => ({ queryKey: ['regions'] }),
}))

const optionsOf = (element: ReactNode, route = '/') => {
  geocoder.mounts.length = 0
  renderToStaticMarkup(<MemoryRouter initialEntries={[route]}>{element}</MemoryRouter>)

  // A field that never reached the stub would make every absence assertion below vacuous.
  if (geocoder.mounts.length !== 1) throw new Error(`${geocoder.mounts.length} geocoders mounted`)

  return geocoder.mounts[0]
}

// A spread key escapes the excess-property check, so every option spread into `<Geocoder options>`
// needs a case here.
describe('MapSearch — the options a mount hands the geocoder', () => {
  // Mapbox bills a permanent lookup separately, and allows storing an id only from one; nothing
  // here stores one (docs/rules/mapbox.md).
  it('asks for a temporary answer, from both mounts', () => {
    expect(optionsOf(<MapSearch onSelect={() => {}} />)).not.toHaveProperty('permanent')
    expect(optionsOf(<SearchField />)).not.toHaveProperty('permanent')
  })

  it('scopes the lookup to the country the route names, and to none without one', () => {
    expect(optionsOf(<MapSearch onSelect={() => {}} />, '/gb').country).toBe('GB')
    expect(optionsOf(<MapSearch onSelect={() => {}} />)).not.toHaveProperty('country')
  })

  // The locale is read per render, so a switch reaches the options the element is handed and the
  // geocoder needs no relabelling call of its own — unlike the map, which reads `language` once.
  it('hands the geocoder the current locale, and the next one after a switch', () => {
    geocoder.locale = 'en'
    expect(optionsOf(<MapSearch onSelect={() => {}} />).language).toBe('en')
    geocoder.locale = 'fr'
    expect(optionsOf(<MapSearch onSelect={() => {}} />).language).toBe('fr')
    geocoder.locale = 'en'
  })
})
