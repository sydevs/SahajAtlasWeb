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
  // One geojson feature; `region` carries the breadcrumb ancestry the split reads,
  // geometry is null for online events, `next` seeds the roll-up ordering.
  const feature = ({
    id,
    regionId,
    slug,
    breadcrumbs,
    eventType = 'offline',
    coordinates,
    webPath,
    next,
  }: {
    id: number
    regionId: number
    slug: string
    breadcrumbs: number[]
    eventType?: 'offline' | 'online'
    coordinates?: [number, number]
    webPath?: string
    next?: string
  }) => ({
    type: 'Feature',
    geometry: coordinates ? { type: 'Point', coordinates } : null,
    properties: {
      id,
      title: `Event ${id}`,
      eventType,
      languages: ['nl'],
      webPath,
      region: {
        id: regionId,
        slug,
        level: 'city',
        breadcrumbs: breadcrumbs.map((doc) => ({ doc })),
      },
      schedule: next ? { firstDate: '2026-01-01T00:00:00Z', upcomingDates: [next] } : undefined,
    },
  })

  // Belgium(28), a country with three city children: Antwerpen(473) [2 located →
  // carded], Brussels(470) [1 located → promoted], Ghent(475) [1 online → no card].
  const country = {
    id: 28,
    slug: 'belgium',
    level: 'country',
    name: 'Belgium',
    webPath: '/belgium',
    webUrl: 'https://atlas.example/belgium',
    legacyData: { countryCode: 'BE' },
  }
  const children = [
    { id: 473, slug: 'antwerpen', level: 'city', name: 'Antwerpen', webPath: '/belgium/antwerpen' },
    { id: 470, slug: 'brussels', level: 'city', name: 'Brussels', webPath: '/belgium/brussels' },
    { id: 475, slug: 'ghent', level: 'city', name: 'Ghent', webPath: '/belgium/ghent' },
  ]
  const countryFeed = [
    feature({
      id: 1,
      regionId: 473,
      slug: 'antwerpen',
      breadcrumbs: [28, 473],
      coordinates: [4.4, 51.2],
    }),
    feature({
      id: 2,
      regionId: 473,
      slug: 'antwerpen',
      breadcrumbs: [28, 473],
      coordinates: [4.41, 51.21],
    }),
    feature({
      id: 3,
      regionId: 470,
      slug: 'brussels',
      breadcrumbs: [28, 470],
      coordinates: [4.35, 50.85],
    }),
    feature({
      id: 4,
      regionId: 475,
      slug: 'ghent',
      breadcrumbs: [28, 475],
      eventType: 'online',
      next: '2026-08-01T00:00:00Z',
    }),
    feature({
      id: 5,
      regionId: 473,
      slug: 'antwerpen',
      breadcrumbs: [28, 473],
      eventType: 'online',
      next: '2026-07-20T00:00:00Z',
    }),
  ]

  const countryRoute = (url: string, config?: { params?: { where?: Record<string, unknown> } }) => {
    const where = config?.params?.where

    if (url === '/regions' && where?.slug) return { data: { docs: [country] } }
    if (url === '/regions' && where?.parent) return { data: { docs: children } }

    return { data: { type: 'FeatureCollection', features: countryFeed } }
  }

  it('cards ≥2-event children, promotes single-event children, rolls up online', async () => {
    get.mockImplementation((url: string, config?: never) =>
      Promise.resolve(countryRoute(url, config)),
    )

    const region = await api.getRegion('belgium')

    // Core derivations: level, ISO code, path, canonical URL, bounds of located events.
    expect(region.level).toBe('country')
    expect(region.countryCode).toBe('BE')
    expect(region.path).toBe('/belgium')
    expect(region.webUrl).toBe('https://atlas.example/belgium')
    expect(region.bounds).toEqual([4.35, 50.85, 4.41, 51.21])
    // eventCount stays total (online included) — an online-only subtree still renders.
    expect(region.eventCount).toBe(5)

    // Only Antwerpen (2 located) is carded, badge = located count; Brussels (1) and
    // Ghent (online-only) are not.
    expect(region.subregions).toHaveLength(1)
    expect(region.subregions[0]).toMatchObject({
      slug: 'antwerpen',
      eventCount: 2,
      path: '/belgium/antwerpen',
    })

    // Brussels' single event is promoted into the list, nested under *this* region.
    expect(region.events).toHaveLength(1)
    expect(region.events[0]).toMatchObject({ id: 3, eventType: 'offline', path: '/belgium/3' })

    // Both online events roll up (Ghent + Antwerpen), soonest next occurrence first.
    expect(region.onlineEvents.map((event) => event.id)).toEqual([5, 4])
    expect(region.onlineEvents.every((event) => event.eventType === 'online')).toBe(true)
  })

  it('splits a leaf city into located events and an online roll-up', async () => {
    const city = {
      id: 470,
      slug: 'brussels',
      level: 'city',
      name: 'Brussels',
      subtitle: 'Capital',
      webPath: '/belgium/brussels',
      webUrl: 'https://atlas.example/belgium/brussels',
    }
    const leafFeed = [
      feature({
        id: 10,
        regionId: 470,
        slug: 'brussels',
        breadcrumbs: [28, 470],
        coordinates: [4.35, 50.85],
      }),
      feature({
        id: 11,
        regionId: 470,
        slug: 'brussels',
        breadcrumbs: [28, 470],
        eventType: 'online',
      }),
    ]
    const leafRoute = (url: string, config?: { params?: { where?: Record<string, unknown> } }) =>
      url === '/regions' && config?.params?.where?.slug
        ? { data: { docs: [city] } }
        : { data: { type: 'FeatureCollection', features: leafFeed } }

    get.mockImplementation((url: string, config?: never) => Promise.resolve(leafRoute(url, config)))

    const region = await api.getRegion('brussels')

    expect(region.level).toBe('city')
    expect(region.subregions).toHaveLength(0)
    // Located event stays in `events` (feed order), nested under the city path.
    expect(region.events.map((event) => event.id)).toEqual([10])
    expect(region.events[0]).toMatchObject({ eventType: 'offline', path: '/belgium/brussels/10' })
    // The online event rolls up instead of interleaving.
    expect(region.onlineEvents.map((event) => event.id)).toEqual([11])
    expect(region.onlineEvents[0].eventType).toBe('online')
  })
})

describe('getEvent', () => {
  // getEvent resolves image URLs at the boundary: SahajCloud serves a relative
  // `url` in dev, so the fetcher origin-prefixes it. A null url (a file-less
  // image) is left null for the UI to skip — the boundary never drops images.
  const rawEvent = {
    id: 13,
    title: 'Voronezh Class',
    eventType: 'offline',
    languages: ['ru'],
    registrationMode: 'sahaj-atlas',
    region: { id: 5, slug: 'voronezh', level: 'city' },
    images: [
      { id: 2, filename: 'pic.jpg', url: '/api/images/file/pic.jpg', alt: 'Hall' },
      { id: 3, url: null, alt: 'no file' },
    ],
  }

  it('resolves relative image URLs against the origin, leaving null urls null', async () => {
    get.mockResolvedValue({ data: rawEvent })

    const event = await api.getEvent(13)

    // Absolute after resolution, without coupling to a specific origin (the dev
    // `.env.local` and CI `.env` set different SahajCloud URLs).
    expect(event.images[0].url).toMatch(/^https?:\/\/.*\/api\/images\/file\/pic\.jpg$/)
    // Null stays null (the UI skips it); the boundary maps, it doesn't filter.
    expect(event.images[1].url).toBeNull()
    expect(event.images).toHaveLength(2)
  })
})
