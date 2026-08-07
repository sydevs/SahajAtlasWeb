import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef } from 'react'

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
 * Returns a stable callback that warms an event's detail query (`['event', id, locale]`)
 * so opening it is a cache hit rather than a cold `findByID` round-trip.
 *
 * This is the **unthrottled** warm — for deliberate, already-bounded callers (the idle
 * warm-up below). Anything driven by pointer movement wants `useHoverPrefetch`.
 *
 * The prefetch opts out of retries: a warm nobody is waiting for has no business
 * re-queueing itself against an API that just failed, and the view that actually needs
 * the data reads it through its own query, which does retry.
 */
export function usePrefetchEvent() {
  const queryClient = useQueryClient()
  const { locale } = useLocale()

  return useCallback(
    // Returns the prefetch promise (it never rejects) so callers that meter concurrency
    // can tell when the request has actually settled.
    (id: number) => queryClient.prefetchQuery({ ...eventQuery(id, locale), retry: false }),
    [queryClient, locale],
  )
}

/**
 * The hover/focus counterpart: same warm, gated by dwell + a shared concurrency cap
 * (see `@/lib/prefetch-intent`). Wire `enter` to a card's `mouseenter`/`focus` and
 * `leave` to its `mouseleave`/`blur` — the fetch then runs during the pointer's
 * travel-to-click for a card the viewer is actually aiming at, and not at all for the
 * hundred cards they merely swept across on the way.
 */
export function useHoverPrefetch() {
  const warm = usePrefetchEvent()
  // The last id this card started a dwell for, so the unmount teardown below is KEYED.
  // A bare `dispose()` would have every unmounting card cancel whatever dwell happens to
  // be pending — and rows unmount constantly as the list re-pages, so the row actually
  // under the cursor would lose its warm to a neighbour's teardown.
  const entered = useRef<number | null>(null)

  // Drop this card's own pending dwell if it unmounts mid-hover.
  useEffect(
    () => () => {
      if (entered.current !== null) hoverIntent.leave(entered.current)
    },
    [],
  )

  return useMemo(
    () => ({
      enter: (id: number) => {
        entered.current = id
        hoverIntent.enter(id, () => warm(id))
      },
      leave: (id: number) => hoverIntent.leave(id),
    }),
    [warm],
  )
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
