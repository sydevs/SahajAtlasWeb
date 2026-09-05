import { useCallback, useEffect, useState } from 'react'

import { clearFeedback, feedbackAnswer, type FeedbackAnswer } from '@/lib/shape'

/** This is the answer to acknowledge, and the way to put it away. It is `undefined` once there is nothing to show. */
export type PostEventFeedback = {
  answer: FeedbackAnswer | undefined
  dismiss: () => void
}

/**
 * This is the post-event feedback answer this page was opened with. It reads once, comes out of the URL, and is dismissable. See #164.
 *
 * The reader arrives from a follow-up email through a SahajCloud redirect carrying `?feedback=`.
 * This is the whole wiring: read it, hand it to the view that renders the acknowledgement, remove it, and let the reader close it.
 *
 * **This is not a generic `useQueryParam`, and the difference is the whole module.**
 * A generic reader would take the ROUTER's params, the one place this value never appears.
 * `?feedback=` sits on the host page's real query string. The router describes only the route the widget owns, the `?atlas=` value, or the pathname in path mode.
 * This hook also reads once and then removes the value, instead of observing it, and it carries dismissal state.
 * These are three different contracts. See `lib/shape/feedback-param.ts`.
 *
 * **This reads in a `useState` initializer, not an effect.** That choice makes a COLD load work, the ticket's last acceptance criterion.
 * The answer must be known during the very first render.
 * Otherwise the banner would appear one commit late, a flash of the page without it, and could even race the removal below.
 * A reader arriving from an email client always takes this path.
 * An in-widget navigation never carries the parameter at all, so nothing renders and nothing gets stripped.
 *
 * **This removes the parameter in an effect, so the read completes before the URL changes.**
 * Both views can be mounted at once. An event route renders its region as an ancestor in the drawer stack.
 * React runs every render before any effect, so both views see the same answer, whichever order they mount in.
 * The removal is idempotent, so the second call is a no-op, not a conflict.
 *
 * ⚠ **Dismissal is per-view, deliberately.**
 * Each view calls this hook and holds its own state.
 * So closing the acknowledgement on an event does not close it on the region drawer underneath.
 * That is correct. They are two banners on two screens, and only one of them is ever on top.
 *
 * This returns `undefined` where there is no window at all: the node test lane, and any SSR render.
 * `renderToStaticMarkup` runs initializers but no effects.
 * So a view must degrade to "no banner," instead of throwing.
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
