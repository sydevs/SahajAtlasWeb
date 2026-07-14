import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchIpLocation } from './use-ip-location'

// Mock the network boundary (the bare `fetch`) so these assert our zod parse, not
// ipwho.is itself. Node lane, no jsdom — see .claude/rules/tests.md.
const mockFetch = (body: unknown, ok = true) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => body }))

const VALID = {
  success: true,
  city: 'Paris',
  country: 'France',
  latitude: 48.8566,
  longitude: 2.3522,
}

describe('fetchIpLocation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('parses a valid response into a location (dropping extra fields)', async () => {
    mockFetch(VALID)

    expect(await fetchIpLocation()).toEqual({
      city: 'Paris',
      country: 'France',
      latitude: 48.8566,
      longitude: 2.3522,
    })
  })

  it('returns null for a country-only response (empty city)', async () => {
    mockFetch({ ...VALID, city: '' })

    expect(await fetchIpLocation()).toBeNull()
  })

  it('returns null for an unsuccessful / malformed response', async () => {
    mockFetch({ success: false, message: 'reserved range' })

    expect(await fetchIpLocation()).toBeNull()
  })

  it('returns null on a non-OK HTTP status', async () => {
    mockFetch(VALID, false)

    expect(await fetchIpLocation()).toBeNull()
  })

  it('returns null when the request throws (network / CSP block)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('blocked')))

    expect(await fetchIpLocation()).toBeNull()
  })
})
