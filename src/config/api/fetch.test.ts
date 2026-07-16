import { describe, it, expect, vi, beforeEach } from 'vitest'

import atlasAuth from './auth'
import { applyRequestContext } from './client'
import api, { shapeEventDoc } from './fetch'

import preview from '@/config/preview'
import { queryClient } from '@/config/query-client'
import { EventDocSchema } from '@/types'

// We mock @payloadcms/sdk at the boundary (mirrors mocking axios before). The
// PayloadSDK constructor returns a stub whose find/findByID/request the fetchers call;
// the cross-cutting auth + locale + preview logic lives in `applyRequestContext`, tested
// directly (no network round-trip). i18n is mocked so importing the client doesn't boot
// the real HTTP backend / language detector.
//
// vi.hoisted runs before the hoisted vi.mock factory, so `sdk` is already spied when
// client.ts calls `new PayloadSDK(...)`.
const sdk = vi.hoisted(() => ({ find: vi.fn(), findByID: vi.fn(), request: vi.fn() }))

vi.mock('@payloadcms/sdk', () => ({
  // A class so `new PayloadSDK(...)` in client.ts constructs cleanly; each instance's
  // methods point at the shared hoisted spies the tests drive.
  PayloadSDK: class {
    find = sdk.find
    findByID = sdk.findByID
    request = sdk.request
  },
}))
vi.mock('@/config/i18n', () => ({ default: { resolvedLanguage: 'fr' } }))

// A stubbed SDK Response: `sdk.request` resolves to a Response; `requestJson` reads `.json()`.
const jsonResponse = (data: unknown) => ({ json: async () => data })

beforeEach(() => {
  sdk.find.mockReset()
  sdk.findByID.mockReset()
  sdk.request.mockReset()
  // Reset the shared preview singleton so only tests that opt in see preview mode.
  preview.active = false
  preview.secret = null
  // loadRegions/loadGeojson/loadEventTitles cache through the shared QueryClient — clear
  // it so each test re-reads the mocked data rather than a previous test's cached one.
  queryClient.clear()
})

describe('applyRequestContext (auth + locale + preview on every request)', () => {
  // The interceptor mutates a URL + Headers in place; build a fresh pair and apply it.
  const context = (href = 'https://cloud.example/api/regions') => {
    const url = new URL(href)
    const headers = new Headers()

    applyRequestContext(url, headers)

    return { url, headers }
  }

  it('attaches the clients API-Key and resolved locale to every request', () => {
    atlasAuth.apiKey = 'test-key-123'

    const { url, headers } = context()

    expect(headers.get('Authorization')).toBe('clients API-Key test-key-123')
    expect(url.searchParams.get('locale')).toBe('fr')
  })

  it('adds the locale without dropping existing query params', () => {
    atlasAuth.apiKey = 'k'

    const { url } = context('https://cloud.example/api/regions?depth=1')

    expect(url.searchParams.get('depth')).toBe('1')
    expect(url.searchParams.get('locale')).toBe('fr')
  })

  it('omits the Authorization header when no api key is set', () => {
    atlasAuth.apiKey = null

    expect(context().headers.get('Authorization')).toBeNull()
  })

  it('forwards the preview secret header and draft=true for an active preview session', () => {
    atlasAuth.apiKey = 'k'
    preview.active = true
    preview.secret = 'preview-secret'

    const { url, headers } = context()

    expect(headers.get('x-sahajcloud-preview-secret')).toBe('preview-secret')
    expect(url.searchParams.get('draft')).toBe('true')
    expect(url.searchParams.get('locale')).toBe('fr')
  })

  it('does not forward draft/secret when the session carries no secret', () => {
    atlasAuth.apiKey = 'k'
    preview.active = true
    preview.secret = null

    const { url, headers } = context()

    expect(headers.get('x-sahajcloud-preview-secret')).toBeNull()
    expect(url.searchParams.get('draft')).toBeNull()
  })
})

describe('getGeojson', () => {
  it('reads the feed via the raw request helper with select + populate and parses it', async () => {
    sdk.request.mockResolvedValue(
      jsonResponse({
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
      }),
    )

    const geojson = await api.getGeojson()

    const [options] = sdk.request.mock.calls[0] as [{ path: string; args: Record<string, unknown> }]

    expect(options.path).toBe('/events/geojson')
    expect(options.args.select).toBeTruthy()
    expect(options.args.populate).toBeTruthy()
    expect(options.args.pagination).toBe(false)
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
  // The wholesale regions read returns the whole tree with each node's parent link;
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

  // getRegion makes three reads: the wholesale region tree (sdk.find on `regions`), the
  // agnostic feed (sdk.request on /events/geojson), and the per-locale titles sliver
  // (sdk.find on `events`, id→title) joined back by id. Dispatch the SDK stubs by which.
  const mockBackend = (feed = countryFeed, nodes: unknown[] = tree) => {
    sdk.find.mockImplementation((options: { collection: string }) => {
      if (options.collection === 'regions') return Promise.resolve({ docs: nodes })

      const docs = feed.map((f) => ({ id: f.properties.id, title: `Event ${f.properties.id}` }))

      return Promise.resolve({ docs })
    })
    sdk.request.mockResolvedValue(jsonResponse({ type: 'FeatureCollection', features: feed }))
  }

  it('cards every child with a located event and rolls up online', async () => {
    mockBackend()

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

    mockBackend([feature({ id: 1, regionId: 9, slug: 'de', coordinates: [13.4, 52.5] })], isoTree)

    const region = await api.getRegion('de')

    expect(region.countryCode).toBe('de')
  })

  it('throws when the slug is not in the region tree', async () => {
    mockBackend()

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

    mockBackend([], empty)

    await expect(api.getRegion('empty-land')).rejects.toThrow('no events')
  })

  it('renders an online-only region (rolls up, does NOT 404)', async () => {
    const onlineTree = [
      {
        id: 5,
        slug: 'onlyonline',
        level: 'country',
        name: 'OnlyOnline',
        parent: null,
        webPath: '/onlyonline',
      },
    ]
    const onlineFeed = [
      feature({ id: 20, regionId: 5, slug: 'onlyonline', eventType: 'online', next: '2026-09-01' }),
    ]

    mockBackend(onlineFeed, onlineTree)

    const region = await api.getRegion('onlyonline')

    // Online events count toward eventCount, so the subtree isn't "empty" — it renders.
    expect(region.eventCount).toBe(1)
    expect(region.events).toHaveLength(0)
    expect(region.onlineEvents.map((event) => event.id)).toEqual([20])
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

    mockBackend(leafFeed, [city])

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
    // findByID returns the doc directly (no axios `.data` envelope).
    sdk.findByID.mockResolvedValue(rawEvent)

    const event = await api.getEvent(13)

    // Absolute after resolution, without coupling to a specific origin (the dev
    // `.env.local` and CI `.env` set different SahajCloud URLs).
    expect(event.images[0].url).toMatch(/^https?:\/\/.*\/api\/images\/file\/pic\.jpg$/)
    // Null stays null (the UI skips it); the boundary maps, it doesn't filter.
    expect(event.images[1].url).toBeNull()
    expect(event.images).toHaveLength(2)
  })
})

describe('shapeEventDoc', () => {
  const parse = (overrides: Record<string, unknown> = {}) =>
    EventDocSchema.parse({
      id: 13,
      title: 'Voronezh Class',
      eventType: 'offline',
      languages: ['ru'],
      registrationMode: 'sahaj-atlas',
      region: { id: 5, slug: 'voronezh', level: 'city' },
      ...overrides,
    })

  it('derives path from a safe site-relative webPath', () => {
    expect(shapeEventDoc(parse({ webPath: '/russia/voronezh/13' })).path).toBe(
      '/russia/voronezh/13',
    )
  })

  it('falls back to /:id when webPath is missing or unsafe', () => {
    expect(shapeEventDoc(parse()).path).toBe('/13')
    expect(shapeEventDoc(parse({ webPath: 'https://evil.example' })).path).toBe('/13')
  })

  it('resolves relative image urls at the boundary, leaving null urls null', () => {
    const shaped = shapeEventDoc(
      parse({
        images: [
          { id: 2, filename: 'pic.jpg', url: '/api/images/file/pic.jpg', alt: 'Hall' },
          { id: 3, url: null, alt: 'no file' },
        ],
      }),
    )

    expect(shaped.images[0].url).toMatch(/^https?:\/\/.*\/api\/images\/file\/pic\.jpg$/)
    expect(shaped.images[1].url).toBeNull()
  })
})
