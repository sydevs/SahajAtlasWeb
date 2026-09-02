/**
 * The post-event feedback answer, as it arrives on the host page's own URL (#164).
 *
 * A registrant of an unverified event gets a follow-up email asking "did this class take place?"
 * (sydevs/SahajCloud#626). SahajCloud records the vote and then 302s the reader here, carrying the
 * answer in one parameter:
 *
 * ```
 * https://wemeditate.com/map/gb/london/1204?feedback=confirmed   # the event's own page
 * https://wemeditate.com/map/gb/london?feedback=denied           # the event's REGION page
 * ```
 *
 * ⚠ **This parameter is on the HOST's real query string, not inside `?atlas=`, and that is why it
 * cannot be read with `useSearchParams`.** The widget's router describes the route it owns — in
 * query mode the value of `?atlas=`, in path mode the pathname plus the query nested inside
 * `?atlas=` (`routeFromPathname`). A parameter the CMS appended to a canonical URL is in neither,
 * so the router's `location.search` never contains it. It is read off `window.location` at the call
 * site, exactly as `pageLocaleOverride` is and for the same reason.
 *
 * This module is pure — no `window` — so the decision is testable in the node lane;
 * `clearFeedback` is the one part that touches `history`.
 *
 * **The URL editing itself is not here.** Removing one parameter without disturbing the rest is a
 * general problem the widget has wherever it writes onto a host's URL, so it lives in `query.ts`;
 * this module only says which name it claims and what the two answers mean.
 */

import { hrefWithout } from './query'

/**
 * The parameter name, defined once.
 *
 * ⚠ **The widget does not own this name the way it owns `atlas` and `locale`.** Those two it
 * WRITES; this one it only ever reads and then removes. It is spelled here so the reader and the
 * remover cannot drift — the failure mode of a drift is silent in both directions: a banner that
 * never shows, or a parameter that rides along in every link the visitor copies afterwards.
 */
export const FEEDBACK_PARAM = 'feedback'

/**
 * The two answers the follow-up email can produce.
 *
 * Kept as a closed list rather than a free string because the value decides which copy renders,
 * and a third spelling arriving from anywhere should read as "no answer" rather than as one of
 * these — see `feedbackAnswer`.
 */
export const FEEDBACK_ANSWERS = ['confirmed', 'denied'] as const

export type FeedbackAnswer = (typeof FEEDBACK_ANSWERS)[number]

/**
 * The answer the page URL carries, if it names one we actually render.
 *
 * ⚠ **Resolvable, not merely present.** `?feedback=maybe` is not an answer, and treating any
 * value as one would render a banner with no copy behind it. Matching is case-insensitive because
 * a mail client or a link-tracker that normalises the query should not silently drop the
 * acknowledgement.
 *
 * Never throws: a malformed query string belongs to a page we do not own, and an unreadable one is
 * not worth taking the host's scripts down for.
 */
export function feedbackAnswer(search: string | null | undefined): FeedbackAnswer | undefined {
  try {
    const raw = new URLSearchParams(search ?? '').get(FEEDBACK_PARAM)?.trim().toLowerCase()

    return FEEDBACK_ANSWERS.find((answer) => answer === raw)
  } catch {
    return undefined
  }
}

/**
 * Take the answer back out of the host's URL, once it has been read.
 *
 * The parameter is a one-shot instruction from an email, not a place. Left in the address bar it
 * would ride along in anything the visitor copies, reappear on every reload as a fresh
 * acknowledgement, and — since these pages are indexed — offer a crawler a second URL for a page
 * that already has a canonical one.
 *
 * Written the same way `publishLocale` writes the language, and for the same three reasons:
 *
 *  - **`replaceState`, not push.** Consuming a parameter is not a navigation. A pushed entry would
 *    put the answer back on Back.
 *  - **`history.state` is passed through verbatim**, which keeps the atlas history's `__sy_atlas`
 *    slice — the entry key and depth that `rememberCamera` and the drawer's dismissal read.
 *    Dropping it would make the next X climb to the structural parent instead of going back.
 *  - **it does not go through `AtlasRouter`.** The router mints a route entry per write, and this
 *    is not a route change. Writing behind the history's back is safe precisely because `?atlas=`
 *    is untouched, and that is the only parameter the history re-reads.
 */
export function clearFeedback(win: Window = window): void {
  const href = hrefWithout(win.location.href, FEEDBACK_PARAM)

  if (!href || href === win.location.href) return

  try {
    win.history.replaceState(win.history.state, '', href)
  } catch {
    // A document that refuses replaceState keeps the parameter for this session and simply does
    // not clean it up — the same posture the atlas history and `publishLocale` take on a refused
    // write. The banner has already rendered, which is the part that matters to the reader.
  }
}
