import { QueryClient, QueryObserver, environmentManager } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'

import { eventTitlesQuery, eventsQuery, geojsonQuery, regionsQuery } from '@/config/api'
import { WHOLESALE_GC_TIME } from '@/config/query-client'
import { DEFAULT_FILTERS } from '@/lib/shape'

// `@/config/api` reaches the SDK client, and through it i18next, at import time.
// This mocks both at the boundary, the same way `fetch.test.ts` does.
// Nothing here makes a request.
// The subject is the query CONTRACT's pressure knobs, driven through a real `QueryObserver`.
vi.mock('@payloadcms/sdk', () => ({
  PayloadSDK: class {
    find = vi.fn()
    findByID = vi.fn()
    request = vi.fn()
  },
}))
vi.mock('@/config/i18n', () => ({ default: { resolvedLanguage: 'en' } }))

const options = eventsQuery(51.5074, -0.1278, DEFAULT_FILTERS, 'en')

// This is one macrotask tick. It drains the microtasks the retryer settles in.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * This mounts and unmounts an observer on the events query, the lifecycle a drawer remount puts it through.
 * A `QueryObserver` is what `useSuspenseQuery` is built on.
 * So this is the real subscribe-and-refetch-on-mount path, with no DOM needed.
 */
const openAndClose = async (
  client: QueryClient,
  queryFn: () => Promise<unknown[]>,
  overrides: { staleTime?: number } = {},
) => {
  const observer = new QueryObserver(client, { ...options, queryFn, ...overrides })
  const unsubscribe = observer.subscribe(() => {})

  await settle()
  unsubscribe()
}

describe('eventsQuery pressure (issue #97)', () => {
  it('recomputes nothing when the list remounts inside the stale window', async () => {
    // The query function IS the cost.
    // `getEvents` issues no request.
    // It re-runs the full-feed predicate, a zod parse per surviving event, and a distance sort.
    // Counting its calls therefore counts main-thread work, not network traffic.
    const queryFn = vi.fn(async () => [])
    const client = new QueryClient()

    await openAndClose(client, queryFn) // open the results list
    await openAndClose(client, queryFn) // drill into an event and come back
    await openAndClose(client, queryFn) // and again

    expect(queryFn).toHaveBeenCalledTimes(1)
  })

  it('proves the guarantee is the staleTime — the default recomputes on every mount', async () => {
    // This is the control.
    // Without it, the test above would pass on a cache hit alone.
    // It would not notice the day someone drops `staleTime` from the factory.
    const queryFn = vi.fn(async () => [])
    const client = new QueryClient()

    await openAndClose(client, queryFn, { staleTime: 0 })
    await openAndClose(client, queryFn, { staleTime: 0 })
    await openAndClose(client, queryFn, { staleTime: 0 })

    expect(queryFn).toHaveBeenCalledTimes(3)
  })

  it('holds the derived list longer than it stays fresh', () => {
    // Otherwise the entry gets collected while the window is still open.
    // The `staleTime` above would then buy nothing on the very path it exists for, an unmounted drawer.
    expect(options.gcTime).toBeGreaterThan(options.staleTime)
  })
})

describe('the wholesale factories carry their retention pin', () => {
  // This checks the FACTORIES, not the constants.
  // A `gcTime` that is defined but never wired into the query contract reads exactly like one that is.
  // The default, 5 minutes, would then quietly evict the caches the whole fetch-once architecture is built on.
  it('pins the feed, the region tree and the titles sliver for the session', () => {
    expect(geojsonQuery().gcTime).toBe(WHOLESALE_GC_TIME)
    expect(regionsQuery().gcTime).toBe(WHOLESALE_GC_TIME)
    expect(eventTitlesQuery('en').gcTime).toBe(WHOLESALE_GC_TIME)
  })

  // React Query keeps the longest `gcTime` any writer of a key has stated, and the first writer
  // is whoever asks first. A screen that leaves the pin to the loader builds an entry on the
  // 5-minute default, which holds until the loader next fetches for itself.
  describe('when a screen, not the loader, builds the feed entry', () => {
    const feed = { type: 'FeatureCollection' as const, features: [] }

    /** Mounts and unmounts one observer, then idles for ten minutes. */
    const idleAfter = async (overrides: { gcTime?: number } = {}) => {
      const client = new QueryClient()
      const observer = new QueryObserver(client, {
        ...geojsonQuery(),
        queryFn: async () => feed,
        ...overrides,
      })
      const unsubscribe = observer.subscribe(() => {})

      await vi.advanceTimersByTimeAsync(0)
      unsubscribe()
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000)

      return client.getQueryData(geojsonQuery().queryKey)
    }

    beforeEach(() => {
      // To React Query the node lane is a server, where an unpinned entry is never collected.
      // The 5-minute default is a browser's, so these two cases run as one.
      environmentManager.setIsServer(() => false)
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
      environmentManager.setIsServer(() => typeof window === 'undefined')
    })

    it('holds the feed past the default window', async () => {
      expect(await idleAfter()).toBe(feed)
    })

    it('proves the guarantee is the pin — the default has collected it by then', async () => {
      expect(await idleAfter({ gcTime: undefined })).toBeUndefined()
    })
  })

  it('keeps the titles sliver per-locale, so a language switch refetches only it', () => {
    expect(eventTitlesQuery('fr').queryKey).not.toEqual(eventTitlesQuery('en').queryKey)
  })
})
