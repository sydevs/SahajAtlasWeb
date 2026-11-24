import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { answerDemo, demo } from './wire-demo'
import { WIRE_API_KEY } from './wire'

import atlasAuth from '@/config/api/auth'
import api from '@/config/api/fetch'
import { queryClient } from '@/config/query-client'

// Ladle's interactive widget reads this atlas, and a class the app cannot parse would blank it
// with no spec to say why. So, as `wire.test.ts` does for the lane's fixtures, this reads it
// through the REAL fetchers and their zod parses, with only the network swapped for the router.
vi.mock('@/config/i18n', () => ({ default: { resolvedLanguage: 'en' } }))

beforeAll(() => {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const answer = answerDemo({ method: init?.method ?? 'GET', url, authorization: null })

    if (!answer) throw new Error(`no demo fixture answers ${url.pathname}`)

    return new Response(JSON.stringify(answer.json), { status: answer.status })
  })
})

afterAll(() => {
  vi.unstubAllGlobals()
  atlasAuth.apiKey = null
})

beforeEach(() => {
  queryClient.clear()
  atlasAuth.apiKey = WIRE_API_KEY
})

describe('the demo atlas, read through the fetchers', () => {
  it('lists enough countries to scroll, each with classes and a flag', async () => {
    const countries = await api.getCountries()

    expect(countries.length).toBeGreaterThanOrEqual(25)
    for (const country of countries) {
      expect(country.eventCount).toBeGreaterThan(0)
      expect(country.countryCode).toMatch(/^[A-Z]{2}$/)
    }
  })

  it('gives the United Kingdom a long list of regions, and Cambridge a long list of classes', async () => {
    expect((await api.getRegion('gb')).subregions.length).toBeGreaterThanOrEqual(10)
    expect((await api.getRegion('cambridge')).events.length).toBeGreaterThanOrEqual(12)
  })

  it('keeps every slug unique, since a region is looked up by its slug', () => {
    const slugs = (demo.regions as { docs: { slug: string }[] }).docs.map(({ slug }) => slug)

    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('serves a full event document for every class in the feed', async () => {
    const feed = await api.getGeojson()

    for (const { properties } of feed.features) {
      expect((await api.getEvent(properties.id)).webPath).toBe(properties.webPath)
    }
  })
})
