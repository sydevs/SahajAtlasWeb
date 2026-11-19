import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { WIRE_API_KEY, WIRE_EVENT, answerSahajCloud, wire } from './wire'

import atlasAuth from '@/config/api/auth'
import api, { eventTitlesQuery } from '@/config/api/fetch'
import mutate, { RegistrationRefusedError } from '@/config/api/mutate'
import { queryClient } from '@/config/query-client'
import translations from '@/config/translations.en.json' with { type: 'json' }

// The browser lane answers SahajCloud from `wire.ts`, and a fixture the app cannot parse would
// fail there as a blank widget, minutes into a CI run. So this runs every fixture through the
// REAL fetchers and their zod parses — the real SDK too, composing the real URLs — with only the
// network swapped for `answerSahajCloud`, the router the lane itself serves.
//
// i18n is the one module stubbed, as `fetch.test.ts` stubs it: booting it would reach for a
// browser this lane does not have.
vi.mock('@/config/i18n', () => ({ default: { resolvedLanguage: 'en' } }))

/** Every request the fetchers made, so a fixture answered by the router is provably the one read. */
const requests: string[] = []

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const serveWire = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input))
  const method = init?.method ?? 'GET'
  const answer = answerSahajCloud({
    method,
    url,
    authorization: new Headers(init?.headers).get('authorization'),
  })

  requests.push(`${method} ${url.pathname}`)

  if (!answer) throw new Error(`no wire fixture answers ${method} ${url.pathname}`)

  return json(answer.json, answer.status)
}

beforeAll(() => {
  vi.stubGlobal('fetch', serveWire)
})

afterAll(() => {
  vi.unstubAllGlobals()
  atlasAuth.apiKey = null
})

beforeEach(() => {
  requests.length = 0
  queryClient.clear()
  atlasAuth.apiKey = WIRE_API_KEY
})

describe('wire fixtures, read through the fetchers', () => {
  it('authenticates the lane key as its client, and nobody else', async () => {
    expect((await api.getClient()).clientId).toBe('browser-lane')

    atlasAuth.apiKey = 'some-other-key'

    // `{ user: null }` is how Payload answers a key it does not know, and the fetcher turns it
    // into the configuration error the widget renders.
    await expect(api.getClient()).rejects.toThrow(/Not authenticated/)
  })

  it('serves the atlas config, offering English only', async () => {
    expect(await api.getAtlasConfig()).toEqual({ availableLocales: ['en'], reportIssueForm: null })
  })

  it('serves the committed English snapshot as the translations global, metadata stripped', async () => {
    expect(await api.getTranslations('en')).toEqual(translations)
  })

  it('serves the region tree, the feed and the titles sliver', async () => {
    const regions = await api.getRegions()
    const feed = await api.getGeojson()
    const titles = await eventTitlesQuery('en').queryFn()

    expect(regions).toHaveLength((wire.regions as { docs: unknown[] }).docs.length)
    expect(feed.features).toHaveLength((wire.feed as { features: unknown[] }).features.length)
    expect([...titles.keys()].sort()).toEqual(feed.features.map((f) => f.properties.id).sort())
    expect(requests).toEqual(['GET /api/regions', 'GET /api/events/geojson', 'GET /api/events'])
  })

  it('serves a full event document for every class in the feed', async () => {
    const feed = await api.getGeojson()

    for (const { properties } of feed.features) {
      expect((await api.getEvent(properties.id)).webPath).toBe(properties.webPath)
    }
  })

  // The browser lane clicks this path, so it must exist in the tree and the feed together: a
  // fixture edit that orphans a region or moves the class breaks it HERE, in seconds.
  it('nests the event the lane opens under a country, a region and a city', async () => {
    const [country] = await api.getCountries()
    const region = await api.getRegion(country.slug)
    const area = await api.getRegion(region.subregions[0].slug)
    const city = await api.getRegion(area.subregions[0].slug)

    expect([country, region.subregions[0], area.subregions[0]].map((node) => node.path)).toEqual([
      '/gb',
      '/gb/cambridgeshire',
      '/gb/cambridgeshire/cambridge',
    ])
    expect(city.events.map(({ id, title, path }) => ({ id, title, path }))).toEqual([WIRE_EVENT])
  })

  it('accepts a registration and an embed report with the envelopes the mutations parse', async () => {
    const registration = {
      name: 'Ada Lovelace',
      email: 'ada@example.org',
      startingAt: new Date('2026-01-02T09:30:00Z'),
    }

    await expect(mutate.createRegistration(WIRE_EVENT.id, registration, 'token')).resolves.toEqual({
      doc: expect.objectContaining({ id: expect.any(Number) }),
    })
    await expect(
      mutate.reportEmbed({} as Parameters<typeof mutate.reportEmbed>[0]),
    ).resolves.toEqual({ ok: true })
  })

  // The lane's failure scenario fulfils this body with a 500. It must stay an uncoded failure,
  // or the form would show a refusal's copy rather than the generic failure the spec asserts.
  it('keeps the server error uncoded, so the form treats it as a failure, not a refusal', async () => {
    vi.stubGlobal('fetch', async () => json(wire.serverError, 500))

    try {
      const sent = mutate.createRegistration(
        WIRE_EVENT.id,
        { name: 'Ada Lovelace', email: 'ada@example.org', startingAt: new Date() },
        'token',
      )

      await expect(sent).rejects.toMatchObject({ status: 500 })
      await expect(sent).rejects.not.toBeInstanceOf(RegistrationRefusedError)
    } finally {
      vi.stubGlobal('fetch', serveWire)
    }
  })
})
