import { useCallback, useEffect, useState } from 'react'

import { clearFeedback, feedbackAnswer, type FeedbackAnswer } from '@/lib/shape'

/** The answer to acknowledge, and the way to put it away. `undefined` once there is nothing to show. */
export type PostEventFeedback = {
  answer: FeedbackAnswer | undefined
  dismiss: () => void
}

/**
 * The post-event feedback answer this page was opened with — read once, taken out of the URL, and
 * dismissable (#164).
 *
 * The reader arrives from a follow-up email via a SahajCloud redirect carrying `?feedback=`. This
 * is the whole wiring: read it, hand it to the view that renders the acknowledgement, remove it,
 * and let the reader close it.
 *
 * **Not a generic `useQueryParam`, and the difference is the whole module.** A generic reader would
 * take the ROUTER's params, which is the one place this value never appears: `?feedback=` is on the
 * host page's real query string, while the router describes only the route the widget owns (the
 * `?atlas=` value, or the pathname in path mode). It is also read-once-then-removed rather than
 * observed, and it carries dismissal state. Three different contracts; see `lib/shape/feedback-param.ts`.
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
 * ⚠ **Dismissal is per-view, deliberately.** Each view calls this hook and holds its own state, so
 * closing the acknowledgement on an event does not close it on the region drawer underneath. That
 * is right: they are two banners on two screens, and only one of them is ever on top.
 *
 * Returns `undefined` where there is no window at all, which is the node test lane and any SSR
 * render: `renderToStaticMarkup` runs initializers but no effects, so a view must degrade to "no
 * banner" rather than throwing.
 */
export function usePostEventFeedback(): PostEventFeedback {
  const [answer, setAnswer] = useState<FeedbackAnswer | undefined>(() =>
    typeof window === 'undefined' ? undefined : feedbackAnswer(window.location.search),
  )

  useEffect(() => {
    if (answer) clearFeedback()
  }, [answer])

  const dismiss = useCallback(() => setAnswer(undefined), [])

  return { answer, dismiss }
}
