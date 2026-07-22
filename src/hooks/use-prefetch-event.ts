import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'

import { eventQuery } from '@/config/api'
import { useLocale } from '@/hooks/use-locale'

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
 * Returns a stable callback that warms an event's detail query (`['event', id, locale]`)
 * so opening it is a cache hit rather than a cold `findByID` round-trip. Wire it to a
 * card's hover/focus — the fetch runs during the pointer's travel-to-click, hiding the
 * latency that otherwise shows as a spinner on every event open.
 */
export function usePrefetchEvent() {
  const queryClient = useQueryClient()
  const { locale } = useLocale()

  return useCallback(
    (id: number) => {
      void queryClient.prefetchQuery(eventQuery(id, locale))
    },
    [queryClient, locale],
  )
}

/**
 * Eagerly warm the first few events of a list once the view is idle — the touch-device
 * counterpart to hover prefetch. Keyed on the leading ids (a stable primitive) so it
 * only re-runs when the prefetched set actually changes, and cancelled on unmount so a
 * quick drill-through doesn't fire stale warm-ups.
 */
export function usePrefetchEvents(ids: number[]) {
  const prefetch = usePrefetchEvent()
  const leading = ids.slice(0, EAGER_COUNT)
  // Depend on a stable primitive (the leading ids joined) since the array is a fresh
  // reference each render; the effect warms the captured `leading` numbers directly.
  const key = leading.join(',')

  useEffect(() => {
    if (!leading.length) return

    return scheduleIdle(() => leading.forEach(prefetch))
  }, [key, prefetch])
}
