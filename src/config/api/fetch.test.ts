import { describe, it, expect, vi, beforeEach } from 'vitest'

import atlasAuth from './auth'
import { toSahajLocale } from './client'
import api from './fetch'

import { queryClient } from '@/config/query-client'

// The shared axios client attaches auth + locale to *every* request via one
// interceptor (so individual fetchers don't). We mock axios to capture that
// interceptor and the `get` method, and mock i18n so importing the client
// doesn't boot the real HTTP backend / language detector.
//
// vi.hoisted runs before the hoisted vi.mock factories, so `use`/`get` are
// already spies when client.ts calls interceptors.request.use(...).
const { use, get } = vi.hoisted(() => ({ use: vi.fn(), get: vi.fn() }))

vi.mock('axios', () => ({
  default: { create: () => ({ interceptors: { request: { use } }, get }) },
}))
vi.mock('@/config/i18n', () => ({ default: { resolvedLanguage: 'fr' } }))

type AxiosRequest = { headers: Record<string, string>; params?: Record<string, unknown> }
const interceptor = use.mock.calls[0][0] as (req: AxiosRequest) => AxiosRequest

beforeEach(() => {
  get.mockReset()
  // loadGeojson caches through the shared QueryClient — clear it so each test
  // re-reads the mocked feed rather than a previous test's cached one.
  queryClient.clear()
})

describe('api request interceptor', () => {
  it('attaches the clients API-Key and resolved locale to every request', () => {
    atlasAuth.apiKey = 'test-key-123'

    const request = interceptor({ headers: {} })

    expect(request.headers['Authorization']).toBe('clients API-Key test-key-123')
    expect(request.params?.locale).toBe('fr')
  })

  it('preserves existing query params while adding the locale', () => {
    atlasAuth.apiKey = 'k'

    const request = interceptor({ headers: {}, params: { depth: 1 } })

    expect(request.params).toMatchObject({ depth: 1, locale: 'fr' })
  })

  it('omits the Authorization header when no api key is set', () => {
    atlasAuth.apiKey = null

    expect(interceptor({ headers: {} }).headers['Authorization']).toBeUndefined()
  })
})

describe('toSahajLocale', () => {
  it('maps i18next codes to SahajCloud locale codes', () => {
    expect(toSahajLocale('fr')).toBe('fr')
    expect(toSahajLocale('pt-BR')).toBe('pt-br')
    expect(toSahajLocale('pt')).toBe('pt-br')
    expect(toSahajLocale('en-US')).toBe('en')
    expect(toSahajLocale('xx')).toBe('en')
    expect(toSahajLocale(undefined)).toBe('en')
  })
})

describe('getGeojson', () => {
  it('reads the feed with a required select + populate and parses the FeatureCollection', async () => {
    get.mockResolvedValue({
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [4.35, 50.85] },
            properties: {
              id: 1,
              title: 'Class',
              eventType: 'offline',
              languages: ['en'],
              region: { id: 9, slug: 'brussels', level: 'city' },
            },
          },
        ],
      },
    })

    const geojson = await api.getGeojson()

    const [path, config] = get.mock.calls[0] as [string, { params: Record<string, unknown> }]

    expect(path).toBe('/events/geojson')
    expect(config.params.select).toBeTruthy()
    expect(config.params.populate).toBeTruthy()
    expect(config.params.pagination).toBe(false)
    expect(geojson.features[0].properties.region.slug).toBe('brussels')
  })
})

describe('getRegion (unified hierarchy derivation)', () => {
  // Belgium(28) → Brussels(470), with one located event under Brussels. The
  // region read resolves by slug alone; the country's path + its child's nested
  // path come from the server `webPath`; counts/bounds from the feed's breadcrumb ids.
  const route = (
    url: string,
    config?: { params?: { where?: Record<string, { equals?: unknown }> } },
  ) => {
    const where = config?.params?.where

    if (url === '/regions' && where?.slug) {
      return {
        data: {
          docs: [
            {
              id: 28,
              slug: 'belgium',
              level: 'country',
              name: 'Belgium',
              webPath: '/belgium',
              webUrl: 'https://atlas.example/belgium',
              legacyData: { countryCode: 'BE' },
            },
          ],
        },
      }
    }
    if (url === '/regions' && where?.parent) {
      return {
        data: {
          docs: [
            {
              id: 470,
              slug: 'brussels',
              level: 'city',
              name: 'Brussels',
              webPath: '/belgium/brussels',
            },
          ],
        },
      }
    }

    // /events/geojson
    return {
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [4.35, 50.85] },
            properties: {
              id: 1,
              title: 'Class',
              eventType: 'offline',
              languages: ['nl'],
              webPath: '/belgium/brussels/1',
              region: {
                id: 470,
                slug: 'brussels',
                level: 'city',
                breadcrumbs: [{ doc: 28 }, { doc: 470 }],
              },
            },
          },
        ],
      },
    }
  }

  it('derives level, eventCount, bounds, ISO code, webPath, and nested children', async () => {
    get.mockImplementation((url: string, config?: never) => Promise.resolve(route(url, config)))

    const region = await api.getRegion('belgium')

    expect(region.level).toBe('country')
    expect(region.eventCount).toBe(1)
    expect(region.bounds).toEqual([4.35, 50.85, 4.35, 50.85])
    expect(region.countryCode).toBe('BE')
    expect(region.path).toBe('/belgium')
    expect(region.webUrl).toBe('https://atlas.example/belgium')
    // a country lists subregions, not events
    expect(region.events).toHaveLength(0)
    expect(region.subregions).toHaveLength(1)
    expect(region.subregions[0]).toMatchObject({
      slug: 'brussels',
      eventCount: 1,
      path: '/belgium/brussels',
    })
  })
})
