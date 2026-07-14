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

describe('getRegion (region-tree derivation)', () => {
  // One geojson feature; ancestry is walked from the regions dict via `region.id`,
  // geometry is null for online events, `next` seeds the roll-up ordering.
  const feature = ({
    id,
    regionId,
    slug,
    eventType = 'offline',
    coordinates,
    next,
  }: {
    id: number
    regionId: number
    slug: string
    eventType?: 'offline' | 'online'
    coordinates?: [number, number]
    next?: string
  }) => ({
    type: 'Feature',
    geometry: coordinates ? { type: 'Point', coordinates } : null,
    properties: {
      id,
      eventType,
      languages: ['nl'],
      region: { id: regionId, slug, level: 'city' },
      schedule: next ? { firstDate: '2026-01-01T00:00:00Z', upcomingDates: [next] } : undefined,
    },
  })

  // Belgium(28), a country with three city children: Antwerpen(473) [2 located →
  // carded], Brussels(470) [1 located → carded], Ghent(475) [1 online → no card].
  // The wholesale /regions read returns the whole tree with each node's parent link;
  // ancestry is walked from those links, not the feed.
  const tree = [
    {
      id: 28,
      slug: 'belgium',
      level: 'country',
      name: 'Belgium',
      parent: null,
      webPath: '/belgium',
      webUrl: 'https://atlas.example/belgium',
      legacyData: { countryCode: 'BE' },
    },
    {
      id: 473,
      slug: 'antwerpen',
      level: 'city',
      name: 'Antwerpen',
      parent: 28,
      webPath: '/belgium/antwerpen',
    },
    {
      id: 470,
      slug: 'brussels',
      level: 'city',
      name: 'Brussels',
      parent: 28,
      webPath: '/belgium/brussels',
    },
    { id: 475, slug: 'ghent', level: 'city', name: 'Ghent', parent: 28, webPath: '/belgium/ghent' },
  ]
  const countryFeed = [
    feature({ id: 1, regionId: 473, slug: 'antwerpen', coordinates: [4.4, 51.2] }),
    feature({ id: 2, regionId: 473, slug: 'antwerpen', coordinates: [4.41, 51.21] }),
    feature({ id: 3, regionId: 470, slug: 'brussels', coordinates: [4.35, 50.85] }),
    feature({
      id: 4,
      regionId: 475,
      slug: 'ghent',
      eventType: 'online',
      next: '2026-08-01T00:00:00Z',
    }),
    feature({
      id: 5,
      regionId: 473,
      slug: 'antwerpen',
      eventType: 'online',
      next: '2026-07-20T00:00:00Z',
    }),
  ]

  // getRegion makes three reads now: the wholesale region tree, the agnostic feed,
  // and the per-locale titles sliver (id→title from /events) joined back by id.
  const route = (url: string, feed = countryFeed, nodes: unknown[] = tree) => {
    if (url === '/regions') return { data: { docs: nodes } }
    if (url === '/events') {
      const docs = feed.map((f) => ({ id: f.properties.id, title: `Event ${f.properties.id}` }))

      return { data: { docs } }
    }

    return { data: { type: 'FeatureCollection', features: feed } }
  }

  it('cards every child with a located event and rolls up online', async () => {
    get.mockImplementation((url: string) => Promise.resolve(route(url)))

    const region = await api.getRegion('belgium')

    // Core derivations: level, ISO code (slug 'belgium' → legacyData fallback), path,
    // canonical URL, bounds of located events.
    expect(region.level).toBe('country')
    expect(region.countryCode).toBe('BE')
    expect(region.path).toBe('/belgium')
    expect(region.webUrl).toBe('https://atlas.example/belgium')
    expect(region.bounds).toEqual([4.35, 50.85, 4.41, 51.21])
    // eventCount stays total (online included) — an online-only subtree still renders.
    expect(region.eventCount).toBe(5)

    // Antwerpen (2 located) and Brussels (1 located) each card with a located-only
    // badge, busiest first; Ghent (online-only) gets no card.
    expect(region.subregions.map((child) => [child.slug, child.eventCount])).toEqual([
      ['antwerpen', 2],
      ['brussels', 1],
    ])
    expect(region.subregions[0].path).toBe('/belgium/antwerpen')

    // No promotion: a country lists no events inline (child events live on child cards).
    expect(region.events).toHaveLength(0)

    // Both online events roll up (Ghent + Antwerpen), soonest next occurrence first.
    expect(region.onlineEvents.map((event) => event.id)).toEqual([5, 4])
    expect(region.onlineEvents.every((event) => event.eventType === 'online')).toBe(true)
  })

  it('derives a country code from an ISO slug (post-#556), with no legacyData', async () => {
    const isoTree = [
      { id: 9, slug: 'de', level: 'country', name: 'Germany', parent: null, webPath: '/de' },
    ]

    get.mockImplementation((url: string) =>
      Promise.resolve(
        route(
          url,
          [feature({ id: 1, regionId: 9, slug: 'de', coordinates: [13.4, 52.5] })],
          isoTree,
        ),
      ),
    )

    const region = await api.getRegion('de')

    expect(region.countryCode).toBe('de')
  })

  it('throws when the slug is not in the region tree', async () => {
    get.mockImplementation((url: string) => Promise.resolve(route(url)))

    await expect(api.getRegion('atlantis')).rejects.toThrow('Region not found')
  })

  it('404s a region with no events under it (located or online)', async () => {
    const empty = [
      {
        id: 7,
        slug: 'empty-land',
        level: 'country',
        name: 'Emptyland',
        parent: null,
        webPath: '/empty-land',
      },
    ]

    get.mockImplementation((url: string) => Promise.resolve(route(url, [], empty)))

    await expect(api.getRegion('empty-land')).rejects.toThrow('no events')
  })

  it('splits a leaf city into located events and an online roll-up', async () => {
    const city = {
      id: 470,
      slug: 'brussels',
      level: 'city',
      name: 'Brussels',
      subtitle: 'Capital',
      parent: 28,
      webPath: '/belgium/brussels',
      webUrl: 'https://atlas.example/belgium/brussels',
    }
    const leafFeed = [
      feature({ id: 10, regionId: 470, slug: 'brussels', coordinates: [4.35, 50.85] }),
      feature({ id: 11, regionId: 470, slug: 'brussels', eventType: 'online' }),
    ]

    get.mockImplementation((url: string) => Promise.resolve(route(url, leafFeed, [city])))

    const region = await api.getRegion('brussels')

    expect(region.level).toBe('city')
    expect(region.subregions).toHaveLength(0)
    // Located event stays in `events` (feed order), nested under the city path.
    expect(region.events.map((event) => event.id)).toEqual([10])
    expect(region.events[0]).toMatchObject({ eventType: 'offline', path: '/belgium/brussels/10' })
    // The localized title is joined in from the per-locale titles sliver, by id.
    expect(region.events[0].title).toBe('Event 10')
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
