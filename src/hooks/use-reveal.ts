import { useTransition } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useResultsReveal } from '@/config/store'
import { DEFAULT_REVEAL } from '@/lib/shape'

// This is how much of the search results list is revealed.
// It lives in session state, through `useResultsReveal`, deliberately NOT in the URL.
// Paging is a reading position, not a destination.
// So a reload starts at the first page, and a shared link opens at the top of the results.
// This is a store, not component state, because the drawer stack remounts views.
// Opening an event and coming back would otherwise drop the reader at the top of a list they had paged deep into. See the store's own note.

export type RevealControls = {
  /** This is the rows revealed so far, at least one page. */
  shown: number
  /** This is whether the distant segment, beyond the boundary, has been reached. */
  showAll: boolean
  /** This is whether a reveal is currently rendering. It drives the control's loading state. */
  pending: boolean
  /** This reveals the next page. Hand it `revealRows`'s `next` value, which computes both fields. */
  revealMore: (next: { shown: number; showAll: boolean }) => void
}

/**
 * `key` identifies the result set the reveal belongs to, through `revealKey`.
 * Reading under a different key than the stored one yields the first page.
 * So a new search, a filter edit, or a re-sort resets the reveal by construction.
 * There is no reset call for a call site to forget.
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
  // The reveal renders another page of unvirtualized cards, each formatting dates.
  // That cost is enough to be felt on a mid-range phone.
  // As a transition, React keeps the current rows interactive while the next page renders.
  // `pending` gives the control an honest loading state, instead of a button that looks ignored.
  //
  // Issue #98 profiled this. It found this is not merely A cost, but THE cost of the list.
  // It costs more than the mounted rows it was assumed to be second to.
  // So the transition is load-bearing, not a nicety.
  // The numbers live with `MAX_REVEAL`, in `lib/shape/reveal.ts`, in one place, so they cannot drift apart.
  const [pending, startTransition] = useTransition()
  const current = storedKey === key

  return {
    shown: current ? shown : DEFAULT_REVEAL,
    showAll: current ? showAll : false,
    pending,
    revealMore: (next) => startTransition(() => revealMore(key, next)),
  }
}
