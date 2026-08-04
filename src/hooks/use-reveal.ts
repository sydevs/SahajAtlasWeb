import { useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { revealFromParams, revealToParams, showAllFromParams } from '@/lib/shape'

// How much of the search results list is revealed lives in the URL (`?shown=`, plus
// `?all=1` once the far segment is showing) like the filters and the sort — so the
// reveal survives the drawer stack's remount-on-navigation (opening an event and
// coming back would silently reset component state) and a deep link restores it.
// Read + advance it with `useReveal`. See `@/lib/shape/reveal`.

export type Reveal = {
  /** Rows revealed so far (at least one page). */
  shown: number
  /** Whether the far (> NEARBY_KM) segment has been revealed. */
  showAll: boolean
  /** Reveal the next page — `revealRows` computes both arguments. */
  revealMore: (shown: number, showAll: boolean) => void
}

export const useReveal = (): Reveal => {
  const [searchParams, setSearchParams] = useSearchParams()

  const { shown, showAll } = useMemo(
    () => ({ shown: revealFromParams(searchParams), showAll: showAllFromParams(searchParams) }),
    [searchParams],
  )

  return {
    shown,
    showAll,
    // `replace` so paging doesn't stack a history entry per press — otherwise the
    // drawer's history-aware dismissal (X / swipe / Esc → `navigate(-1)`) would walk
    // back through every reveal instead of leaving the search.
    revealMore: (next: number, nextShowAll: boolean) =>
      setSearchParams((prev) => revealToParams(next, nextShowAll, new URLSearchParams(prev)), {
        replace: true,
      }),
  }
}
