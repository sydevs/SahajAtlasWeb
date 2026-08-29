import { useEffect, useState } from 'react'

import { clearFeedback, feedbackAnswer, type FeedbackAnswer } from '@/lib/shape'

/**
 * The post-event feedback answer this page was opened with, read once and then taken out of the
 * URL (#164).
 *
 * The reader arrives from a follow-up email via a SahajCloud redirect carrying `?feedback=`. This
 * is the whole wiring: read it, hand it to the view that renders the acknowledgement, remove it.
 *
 * **Read in a `useState` initializer, not an effect**, which is what makes a COLD load work — the
 * ticket's last acceptance criterion. The answer has to be known during the very first render, or
 * the banner would appear one commit late (a flash of the page without it) and, worse, could race
 * the removal below. A reader arriving from an email client is always this path; an in-widget
 * navigation never carries the parameter at all, so nothing renders and nothing is stripped.
 *
 * **Removed in an effect, so the read is complete before the URL changes.** Both views can be
 * mounted at once — an event route renders its region as an ancestor in the drawer stack — and
 * React runs every render before any effect, so both see the same answer whichever order they
 * mount in. The removal is idempotent, so the second call is a no-op rather than a conflict.
 *
 * Returns `undefined` where there is no window at all, which is the node test lane and any SSR
 * render: `renderToStaticMarkup` runs initializers but no effects, so a view must degrade to "no
 * banner" rather than throwing.
 */
export function usePostEventFeedback(): FeedbackAnswer | undefined {
  const [answer] = useState<FeedbackAnswer | undefined>(() =>
    typeof window === 'undefined' ? undefined : feedbackAnswer(window.location.search),
  )

  useEffect(() => {
    if (answer) clearFeedback()
  }, [answer])

  return answer
}
