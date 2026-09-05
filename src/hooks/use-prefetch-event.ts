import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'

import { eventQuery } from '@/config/api'
import { useLocale } from '@/hooks/use-locale'
import { createPrefetchIntent } from '@/lib/prefetch-intent'

// This is how many of a region list's leading events to warm eagerly.
// This number is small on purpose.
// It is the touch-device counterpart to hover prefetch, since there is no pointer to trigger per-card warming.
// So it covers the few most-likely first taps, without a request burst.
const EAGER_COUNT = 3

// This delays the eager warm-up off the view's own paint.
// So it never competes with rendering the list the user is looking at.
// It uses `requestIdleCallback` where available, and a short timeout otherwise, since Safari lacks `requestIdleCallback`.
const scheduleIdle = (run: () => void): (() => void) => {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(run)

    return () => cancelIdleCallback(id)
  }

  const id = window.setTimeout(run, 200)

  return () => window.clearTimeout(id)
}

/**
 * This is ONE gate for the whole widget, deliberately at module scope.
 *
 * Both halves of it must be shared to mean anything.
 * There is only one pointer, so only one row can be dwelling at a time.
 * A per-card instance would hand every card its own in-flight budget.
 * A hundred rows would then allow a hundred requests, the storm this exists to prevent.
 * Two widgets on one page share it too, and that is right.
 * The budget is one browser's politeness toward one API, not a per-element budget.
 */
const hoverIntent = createPrefetchIntent()

/**
 * This is the raw warm. It fills `['event', id, locale]`, so opening the event is a cache hit, not a cold `findByID` round trip.
 * This function is MODULE-PRIVATE.
 * The two hooks below are the ways in, one metered and one deliberately not.
 * An unmetered warm is not something a new caller should be able to reach for by accident.
 *
 * This takes the global retry policy and MUST NOT override it, tempting as `retry: false` looks for a speculative request.
 * `prefetchQuery` calls `fetchQuery`, which calls `query.fetch(opts)`, and that writes those options onto the SHARED `Query` object.
 * `useSuspenseQuery` reaches it through `fetchOptimistic`, which calls `query.fetch()` with no arguments, and so inherits whatever the last writer left.
 * Pinning `retry: false` here would therefore disable retries for EventView's own read of every card the pointer had ever touched.
 * A per-fetch override is simply not expressible through a shared key.
 * `shouldRetryQuery` already caps at one attempt and never retries a 4xx, which is all the restraint a warm needed.
 */
function usePrefetchEvent() {
  const queryClient = useQueryClient()
  const { locale } = useLocale()

  return useCallback(
    // This returns the prefetch promise, which never rejects.
    // So callers that meter concurrency can tell when the request has actually settled.
    (id: number) => queryClient.prefetchQuery(eventQuery(id, locale)),
    [queryClient, locale],
  )
}

/**
 * Speculation is pointless while the browser says there is no network.
 * It is worse than pointless for the gate.
 * React Query's default `networkMode: 'online'` PAUSES a fetch started offline, rather than failing it.
 * So the promise never settles, the in-flight slot never returns, and two such warms would silently kill hover prefetching for the rest of the session.
 */
const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

/**
 * This is the hover and focus counterpart: the same warm, gated by dwell and a shared concurrency cap. See `@/lib/prefetch-intent`.
 * Wire `enter` to a card's `mouseenter` or `focus`, and `leave` to its `mouseleave` or `blur`.
 * The fetch then runs during the pointer's travel to click, for a card the viewer is actually aiming at.
 * It never runs for the hundred cards they merely swept across on the way.
 *
 * This deliberately has no per-card unmount teardown, though a card CAN unmount mid-dwell, since the list re-pages under a stationary cursor.
 * This hook runs on every row of the repo's one memoized 1000-row list.
 * A ref plus a cleanup effect on all thousand of them would buy the cancellation of at most one pending warm, since the gate holds a single timer.
 * The uncancelled case costs one speculative request, which the concurrency cap already bounds.
 * Every case where the pointer actually leaves is covered by `leave`.
 */
export function useHoverPrefetch() {
  const warm = usePrefetchEvent()

  return {
    enter: (id: number) => {
      if (isOffline()) return

      hoverIntent.enter(id, () => warm(id))
    },
    leave: (id: number) => hoverIntent.leave(id),
  }
}

/**
 * This eagerly warms the first few events of a list once the view is idle, the touch-device counterpart to hover prefetch.
 * It keys on the leading ids, a stable primitive, so it only re-runs when the prefetched set actually changes.
 * It cancels on unmount, so a quick drill-through does not fire stale warm-ups.
 *
 * This deliberately does NOT route through the hover gate.
 * This set is already bounded to `EAGER_COUNT`, it is not driven by pointer movement, and metering it would mean a touch device, the one that has no hover to fall back on, silently warms fewer cards than it asked for.
 */
export function usePrefetchEvents(ids: number[]) {
  const prefetch = usePrefetchEvent()
  const leading = ids.slice(0, EAGER_COUNT)
  // This depends on a stable primitive, the leading ids joined, since the array is a fresh reference each render.
  // The effect warms the captured `leading` numbers directly.
  const key = leading.join(',')

  useEffect(() => {
    if (!leading.length) return

    return scheduleIdle(() => leading.forEach((id) => void prefetch(id)))
  }, [key, prefetch])
}
