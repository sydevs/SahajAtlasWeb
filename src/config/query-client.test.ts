import { describe, it, expect } from 'vitest'

import {
  DEFAULT_STALE_TIME,
  EVENTS_STALE_TIME,
  GEOJSON_STALE_TIME,
  MAX_QUERY_RETRIES,
  MAX_RETRY_DELAY,
  REGIONS_STALE_TIME,
  WHOLESALE_GC_TIME,
  queryClient,
  retryDelayFor,
  shouldRetryQuery,
} from './query-client'

import { sdkError } from '@/mocks/errors'
import { atlasError } from '@/lib/report'

// `sdkError` is the shared fixture for "a PayloadSDKError as we see it."
// It is an Error carrying a duck-typed `status`, matched without `instanceof`, for the same cross-realm reason `classifyError` avoids it.
// This spec reuses it, instead of re-declaring it, so this spec and `report.test.ts` cannot end up asserting against two different shapes of SDK error.
const httpError = (status: number) => sdkError(status, `HTTP ${status}`)

describe('shouldRetryQuery', () => {
  it('allows exactly MAX_QUERY_RETRIES extra attempts', () => {
    // React Query passes 0 on the FIRST failure, since query-core increments after asking.
    // So this is the boundary that decides the real attempt count.
    expect(shouldRetryQuery(0, httpError(503))).toBe(true)
    expect(shouldRetryQuery(MAX_QUERY_RETRIES, httpError(503))).toBe(false)
    expect(shouldRetryQuery(MAX_QUERY_RETRIES + 5, httpError(503))).toBe(false)
  })

  it('never retries a 4xx — the server answered and will answer the same', () => {
    for (const status of [400, 401, 403, 404, 410, 422, 429, 499]) {
      expect(shouldRetryQuery(0, httpError(status))).toBe(false)
    }
  })

  it('excepts the two 4xx that describe a moment rather than a verdict', () => {
    expect(shouldRetryQuery(0, httpError(408))).toBe(true)
    expect(shouldRetryQuery(0, httpError(425))).toBe(true)
  })

  it('retries 5xx and unrecognised failures', () => {
    for (const status of [500, 502, 503, 504]) {
      expect(shouldRetryQuery(0, httpError(status))).toBe(true)
    }

    expect(shouldRetryQuery(0, new Error('something odd'))).toBe(true)
  })

  it('reads our own tagged throws through their kind, since they carry no status', () => {
    // These are the two "answered, definitively" cases in our own vocabulary.
    // A dead region link and a rejected API key both fail identically on attempt two.
    expect(shouldRetryQuery(0, atlasError('not-found', 'Region not found: nowhere'))).toBe(false)
    expect(shouldRetryQuery(0, atlasError('config', 'API key not set'))).toBe(false)

    expect(shouldRetryQuery(0, atlasError('server', 'SahajCloud is down'))).toBe(true)
    expect(shouldRetryQuery(0, atlasError('unknown', 'shape drift'))).toBe(true)
  })

  it('survives values that are not Errors at all', () => {
    // This runs inside the retryer, on whatever a third party rejected with.
    expect(() => shouldRetryQuery(0, null)).not.toThrow()
    expect(() => shouldRetryQuery(0, undefined)).not.toThrow()
    expect(() => shouldRetryQuery(0, 'boom')).not.toThrow()
    expect(() => shouldRetryQuery(0, { status: 'nonsense' })).not.toThrow()
    // A string status must not read as an HTTP code, and must not suppress the retry.
    expect(shouldRetryQuery(0, { status: '404' })).toBe(true)
  })
})

describe('retryDelayFor', () => {
  it('spreads the wait across the back half of the window (jitter)', () => {
    // Without jitter, every client that failed during one outage retries in the same millisecond when the API comes back.
    expect(retryDelayFor(0, () => 0)).toBe(500)
    expect(retryDelayFor(0, () => 1)).toBe(1000)
    expect(retryDelayFor(0, () => 0.5)).toBe(750)
  })

  it('grows exponentially and stops at the cap', () => {
    expect(retryDelayFor(1, () => 1)).toBe(2000)
    expect(retryDelayFor(2, () => 1)).toBe(4000)
    // React Query's own default would keep doubling, up to 30s.
    expect(retryDelayFor(10, () => 1)).toBe(MAX_RETRY_DELAY)
  })
})

// These hold by construction today.
// `EVENTS_*` derives from the feed's window. The wholesale pair are hand-chosen literals.
// These tests are tripwires, not derivations.
// The relations are what the comments in `query-client.ts` promise.
// The moment someone replaces a derived constant with an independent literal, the obvious "let's tune the events window separately" edit, this test notices the promise broke.
describe('cache window invariants', () => {
  it('never garbage-collects a wholesale cache before it goes stale', () => {
    // This is the load-bearing relation.
    // A `gcTime` below the stale window makes the stale window unobservable.
    // The entry gets evicted while still nominally fresh, and "fetched once per session" quietly becomes "fetched once per idle gap."
    // These two values compare independently chosen literals.
    // The events pair is derived instead, and the meaningful form of that check lives on the FACTORY, in `api/query-pressure.test.ts`.
    expect(WHOLESALE_GC_TIME).toBeGreaterThan(REGIONS_STALE_TIME)
    expect(WHOLESALE_GC_TIME).toBeGreaterThan(GEOJSON_STALE_TIME)
  })

  it('keeps the derived events list exactly as fresh as the feed it derives from', () => {
    // Recomputing the list more often than its only input can change is work with no possible new answer.
    // So these two values are one decision, not two.
    expect(EVENTS_STALE_TIME).toBe(GEOJSON_STALE_TIME)
  })
})

describe('the shared client actually carries the policy', () => {
  // Without this test, deleting the whole `defaultOptions` block would leave every other spec in this file green.
  // Those other specs exercise the exported helpers, not the wiring that puts them in front of a query.
  it('applies the stale floor, the retry predicate and the capped delay to every query', () => {
    const queries = queryClient.getDefaultOptions().queries

    expect(queries?.staleTime).toBe(DEFAULT_STALE_TIME)
    expect(queries?.retry).toBe(shouldRetryQuery)
    expect(queries?.refetchOnWindowFocus).toBe(false)

    // This is wrapped, not passed by reference.
    // React Query calls it with the error as the second argument, which is the helper's injected-RNG slot.
    const delay = queries?.retryDelay
    const computed = typeof delay === 'function' ? delay(0, new Error('boom')) : Number.NaN

    expect(computed).toBeGreaterThanOrEqual(500)
    expect(computed).toBeLessThanOrEqual(MAX_RETRY_DELAY)
  })

  it('never auto-resends a mutation', () => {
    // The one mutation is a registration. A retry is a duplicate signup, not a recovery.
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(0)
  })
})
