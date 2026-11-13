import type { GeocodingOptions } from '@mapbox/search-js-core'
import type { ReactNode } from 'react'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { MapSearch } from './MapSearch'

import { SearchField } from '@/views/shared'

// Node-only SSR assertions (see `docs/testing.md`). The geocoder is a custom element that cannot
// mount here, so it is stood in for by a stub recording the options it was handed — the request
// Mapbox will receive, which is the only place `permanent` is observable.
const geocoder = vi.hoisted(() => ({ mounts: [] as Partial<GeocodingOptions>[] }))

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
vi.mock('@/hooks/use-locale', () => ({ useLocale: () => ({ locale: 'en' }) }))
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
// needs a case here. Mapbox also bills a permanent lookup separately, and allows storing an id
// only from one.
describe('MapSearch — the options a mount hands the geocoder', () => {
  it('asks for a permanent answer where the caller says the answer is submitted', () => {
    expect(optionsOf(<MapSearch permanent onSelect={() => {}} />).permanent).toBe(true)
  })

  // Absent, not `false` — the geocoder serializes what it is given.
  it('sends no permanent option by default', () => {
    expect(optionsOf(<MapSearch onSelect={() => {}} />)).not.toHaveProperty('permanent')
  })

  it('leaves the header search field temporary', () => {
    expect(optionsOf(<SearchField />)).not.toHaveProperty('permanent')
  })

  it('scopes the lookup to the country the route names, and to none without one', () => {
    expect(optionsOf(<MapSearch onSelect={() => {}} />, '/gb').country).toBe('GB')
    expect(optionsOf(<MapSearch onSelect={() => {}} />)).not.toHaveProperty('country')
  })
})
