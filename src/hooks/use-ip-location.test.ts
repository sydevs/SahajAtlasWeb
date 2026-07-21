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

  it('captures the region and the IP timezone id (dropping the rest of timezone)', async () => {
    mockFetch({
      ...VALID,
      region: 'British Columbia',
      timezone: { id: 'America/Vancouver', offset: -25200, abbr: 'PDT' },
    })

    expect(await fetchIpLocation()).toEqual({
      city: 'Paris',
      country: 'France',
      latitude: 48.8566,
      longitude: 2.3522,
      region: 'British Columbia',
      timezone: { id: 'America/Vancouver' },
    })
  })

  it('still parses when the timezone object is id-less (#64 safe degrade)', async () => {
    // An id-less timezone must not fail the whole location parse — it just leaves
    // nothing to reconcile the region label against, so the time shows bare.
    mockFetch({ ...VALID, timezone: {} })

    expect(await fetchIpLocation()).toEqual({
      city: 'Paris',
      country: 'France',
      latitude: 48.8566,
      longitude: 2.3522,
      timezone: {},
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

  it('returns null when the request throws (network / CSP block / timeout)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('blocked')))

    expect(await fetchIpLocation()).toBeNull()
  })

  it('returns null for out-of-range coordinates (hostile response)', async () => {
    mockFetch({ ...VALID, latitude: 999 })

    expect(await fetchIpLocation()).toBeNull()
  })

  it('returns null for an over-long city (bounded at the trust boundary)', async () => {
    mockFetch({ ...VALID, city: 'x'.repeat(101) })

    expect(await fetchIpLocation()).toBeNull()
  })

  it('returns null when the body is not valid JSON (json() throws)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('Unexpected token')
        },
      }),
    )

    expect(await fetchIpLocation()).toBeNull()
  })
})
