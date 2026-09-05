import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { describe, it, expect, vi } from 'vitest'

import { eventTitlesQuery, eventsQuery, regionsQuery } from '@/config/api'
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
  it('pins the region tree and the titles sliver for the session', () => {
    expect(regionsQuery().gcTime).toBe(WHOLESALE_GC_TIME)
    expect(eventTitlesQuery('en').gcTime).toBe(WHOLESALE_GC_TIME)
  })

  it('keeps the titles sliver per-locale, so a language switch refetches only it', () => {
    expect(eventTitlesQuery('fr').queryKey).not.toEqual(eventTitlesQuery('en').queryKey)
  })
})
