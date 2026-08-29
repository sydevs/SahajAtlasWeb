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
 */

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

/** The name half of a raw `a=b` pair, percent-decoded so `%66eedback` compares equal. */
function pairName(pair: string): string {
  const raw = pair.split('=')[0]

  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '))
  } catch {
    // A malformed `%` escape is not a name we claim. Compare the raw form instead of throwing:
    // this runs over a host's query string, which we do not control.
    return raw
  }
}

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
 * The same query string with `feedback` removed and **every other pair left byte-identical**.
 *
 * ⚠ **`URLSearchParams.delete()` is the obvious way to write this and it is wrong here**, because
 * it re-serializes the whole query rather than editing one pair. Measured, on a URL carrying a
 * route and a host parameter beside the answer:
 *
 * ```
 * in            ?atlas=/nl/amsterdam?center=4.9,52.3&feedback=confirmed&keep=a%20b
 * .delete()     ?atlas=%2Fnl%2Famsterdam%3Fcenter%3D4.9%2C52.3&keep=a+b
 * this          ?atlas=/nl/amsterdam?center=4.9,52.3&keep=a%20b
 * ```
 *
 * Two separate losses in that middle line. It undoes `routeToParam`'s deliberate restoration of
 * `/` and `,` — the one thing that has to stay readable in a link somebody copies — and it rewrites
 * `keep=a%20b` to `keep=a+b`, which is a HOST's parameter that we have no business touching at all.
 * Both are equivalent to a parser and neither is what the page had.
 *
 * So the edit is surgical: split the raw query on `&`, drop the pairs we claim, rejoin. Assigning
 * the result back through `URL.search` is safe where `searchParams` is not — the query
 * percent-encode set covers only C0 controls, space, `"`, `#`, `<`, `>` and `'`, so `/`, `,`, `=`
 * and an already-encoded `%20` all survive verbatim.
 */
export function searchWithoutFeedback(search: string): string {
  const raw = search.startsWith('?') ? search.slice(1) : search

  if (raw === '') return ''

  const kept = raw.split('&').filter((pair) => pair !== '' && pairName(pair) !== FEEDBACK_PARAM)

  return kept.length === 0 ? '' : `?${kept.join('&')}`
}

/**
 * `href` with the answer removed, or `''` when there is nothing to do.
 *
 * `''` covers both "no such parameter" and "will not parse" deliberately: the caller's response to
 * each is the same — leave the URL alone — and collapsing them keeps the one branch at the call
 * site honest rather than inviting a distinction nothing acts on.
 */
export function hrefWithoutFeedback(href: string): string {
  try {
    const url = new URL(href)
    const next = searchWithoutFeedback(url.search)

    if (next === url.search) return ''

    url.search = next

    return url.toString()
  } catch {
    return ''
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
  const href = hrefWithoutFeedback(win.location.href)

  if (!href || href === win.location.href) return

  try {
    win.history.replaceState(win.history.state, '', href)
  } catch {
    // A document that refuses replaceState keeps the parameter for this session and simply does
    // not clean it up — the same posture the atlas history and `publishLocale` take on a refused
    // write. The banner has already rendered, which is the part that matters to the reader.
  }
}
