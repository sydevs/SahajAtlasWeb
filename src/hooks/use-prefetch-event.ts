import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'

import { eventQuery } from '@/config/api'
import { useLocale } from '@/hooks/use-locale'
import { createPrefetchIntent } from '@/lib/prefetch-intent'

// How many of a region list's leading events to warm eagerly. Small on purpose: it's
// the touch-device counterpart to hover prefetch (no pointer to trigger per-card
// warming), so it covers the few most-likely first taps without a request burst.
const EAGER_COUNT = 3

// Delay the eager warm-up off the view's own paint so it never competes with rendering
// the list the user is looking at. `requestIdleCallback` where available; a short
// timeout otherwise (Safari lacks rIC).
const scheduleIdle = (run: () => void): (() => void) => {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(run)

    return () => cancelIdleCallback(id)
  }

  const id = window.setTimeout(run, 200)

  return () => window.clearTimeout(id)
}

/**
 * ONE gate for the whole widget, deliberately at module scope.
 *
 * Both halves of it have to be shared to mean anything: there is only one pointer, so
 * only one row can be dwelling at a time, and a per-card instance would hand every card
 * its own in-flight budget — a hundred rows would then be a hundred allowed requests,
 * which is the storm this exists to prevent. Two widgets on one page share it too, which
 * is right: the budget is one browser's politeness toward one API, not per-element.
 */
const hoverIntent = createPrefetchIntent()

/**
 * The raw warm: fills `['event', id, locale]` so opening the event is a cache hit rather
 * than a cold `findByID` round-trip. **Module-private** — the two hooks below are the
 * ways in, one metered and one deliberately not, and an unmetered warm is not something
 * a new caller should be able to reach for by accident.
 *
 * It takes the global retry policy and **must not override it**, tempting as `retry:
 * false` is for a speculative request. `prefetchQuery` → `fetchQuery` → `query.fetch(opts)`
 * writes those options onto the SHARED `Query` object, and `useSuspenseQuery` reaches it
 * through `fetchOptimistic`, which calls `query.fetch()` with no arguments and so inherits
 * whatever the last writer left. Pinning `retry: false` here therefore disabled retries for
 * EventView's own read of every card the pointer had ever touched — a per-fetch override
 * is simply not expressible through a shared key. `shouldRetryQuery` already caps at one
 * attempt and never retries a 4xx, which is all the restraint a warm needed.
 */
function usePrefetchEvent() {
  const queryClient = useQueryClient()
  const { locale } = useLocale()

  return useCallback(
    // Returns the prefetch promise (it never rejects) so callers that meter concurrency
    // can tell when the request has actually settled.
    (id: number) => queryClient.prefetchQuery(eventQuery(id, locale)),
    [queryClient, locale],
  )
}

/**
 * Speculation is pointless while the browser says there's no network — and worse than
 * pointless for the gate: React Query's default `networkMode: 'online'` *pauses* a fetch
 * started offline rather than failing it, so the promise never settles, the in-flight slot
 * is never returned, and two such warms would silently kill hover prefetching for the rest
 * of the session.
 */
const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

/**
 * The hover/focus counterpart: same warm, gated by dwell + a shared concurrency cap
 * (see `@/lib/prefetch-intent`). Wire `enter` to a card's `mouseenter`/`focus` and
 * `leave` to its `mouseleave`/`blur` — the fetch then runs during the pointer's
 * travel-to-click for a card the viewer is actually aiming at, and not at all for the
 * hundred cards they merely swept across on the way.
 *
 * Deliberately no per-card unmount teardown, though a card CAN unmount mid-dwell (the
 * list re-pages under a stationary cursor). This hook runs on every row of the repo's
 * one memoized 1000-row list, and a ref + a cleanup effect on all thousand of them would
 * buy the cancellation of at most one pending warm — the gate holds a single timer. The
 * uncancelled case costs one speculative request, which the concurrency cap already
 * bounds; every case where the pointer actually leaves is covered by `leave`.
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
 * Eagerly warm the first few events of a list once the view is idle — the touch-device
 * counterpart to hover prefetch. Keyed on the leading ids (a stable primitive) so it
 * only re-runs when the prefetched set actually changes, and cancelled on unmount so a
 * quick drill-through doesn't fire stale warm-ups.
 *
 * Deliberately NOT routed through the hover gate: this set is already bounded to
 * `EAGER_COUNT`, it isn't driven by pointer movement, and metering it would mean a
 * touch device — the one that has no hover to fall back on — silently warms fewer cards
 * than it asked for.
 */
export function usePrefetchEvents(ids: number[]) {
  const prefetch = usePrefetchEvent()
  const leading = ids.slice(0, EAGER_COUNT)
  // Depend on a stable primitive (the leading ids joined) since the array is a fresh
  // reference each render; the effect warms the captured `leading` numbers directly.
  const key = leading.join(',')

  useEffect(() => {
    if (!leading.length) return

    return scheduleIdle(() => leading.forEach((id) => void prefetch(id)))
  }, [key, prefetch])
}
