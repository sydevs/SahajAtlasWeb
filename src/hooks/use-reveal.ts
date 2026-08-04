import { useLocation, useSearchParams } from 'react-router'

import { revealFromParams, revealToParams, showAllFromParams } from '@/lib/shape'

// How much of the search results list is revealed lives in the URL (`?shown=`, plus
// `?all=1` once the far segment is showing) like the filters and the sort — so the
// reveal survives the drawer stack's remount-on-navigation (opening an event and
// coming back would silently reset component state) and a deep link restores it.
// Read + advance it with `useReveal`. See `@/lib/shape/reveal`.

export type RevealControls = {
  /** Rows revealed so far (at least one page). */
  shown: number
  /** Whether the far (> NEARBY_KM) segment has been revealed. */
  showAll: boolean
  /** Reveal the next page — hand it `revealRows`' `next`, which computes both. */
  revealMore: (next: { shown: number; showAll: boolean }) => void
}

export const useReveal = (): RevealControls => {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()

  return {
    shown: revealFromParams(searchParams),
    showAll: showAllFromParams(searchParams),
    // `replace` so paging doesn't stack a history entry per press — otherwise the
    // drawer's history-aware dismissal (X / swipe / Esc → `navigate(-1)`) would walk
    // back through every reveal instead of leaving the search.
    //
    // `state` has to be carried over explicitly: `setSearchParams` forwards only what
    // it's given to `navigate`, so a bare `{ replace: true }` replaces the entry with a
    // state-less one and `atlasDepth` drops to 0 — which turns that same dismissal into
    // a PUSH to the structural parent (re-framing the map instead of restoring the
    // camera) after a single press. FilterView carries it for the same reason.
    revealMore: (next) =>
      setSearchParams((prev) => revealToParams(next.shown, next.showAll, prev), {
        replace: true,
        state: location.state,
      }),
  }
}
