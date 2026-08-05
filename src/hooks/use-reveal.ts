import { useTransition } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useResultsReveal } from '@/config/store'
import { DEFAULT_REVEAL } from '@/lib/shape'

// How much of the search results list is revealed. Session state (`useResultsReveal`),
// deliberately NOT the URL: paging is a reading position, not a destination, so a
// reload starts at the first page and a shared link opens at the top of the results.
// A store rather than component state because the drawer stack remounts views — opening
// an event and coming back would otherwise drop the reader at the top of a list they
// had paged deep into. See the store's own note.

export type RevealControls = {
  /** Rows revealed so far (at least one page). */
  shown: number
  /** Whether the distant (beyond the boundary) segment has been reached. */
  showAll: boolean
  /** Whether a reveal is currently rendering — drives the control's loading state. */
  pending: boolean
  /** Reveal the next page — hand it `revealRows`' `next`, which computes both fields. */
  revealMore: (next: { shown: number; showAll: boolean }) => void
}

/**
 * `key` identifies the result set the reveal belongs to (`revealKey`). Reading under a
 * different key than the stored one yields the first page, so a new search, a filter
 * edit or a re-sort resets the reveal by construction — there is no reset call for a
 * call site to forget.
 */
export const useReveal = (key: string): RevealControls => {
  const { storedKey, shown, showAll, revealMore } = useResultsReveal(
    useShallow((state) => ({
      storedKey: state.key,
      shown: state.shown,
      showAll: state.showAll,
      revealMore: state.revealMore,
    })),
  )
  // The reveal renders another page of unvirtualized cards, each formatting dates —
  // enough to be felt on a mid-range phone. As a transition React keeps the current
  // rows interactive while the next page renders, and `pending` gives the control an
  // honest loading state instead of a button that looks ignored.
  const [pending, startTransition] = useTransition()
  const current = storedKey === key

  return {
    shown: current ? shown : DEFAULT_REVEAL,
    showAll: current ? showAll : false,
    pending,
    revealMore: (next) => startTransition(() => revealMore(key, next)),
  }
}
