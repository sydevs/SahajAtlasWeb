/**
 * Where a framed embed sends a visitor when its frame is too small for the interface (#161).
 *
 * **This is the one place the widget names another site**, so it earns an argument. A framed
 * embed cannot expand: `position: fixed` resolves against the frame, so an overlay would cover
 * the same undersized box the card is already in. Navigating in place would load the fallback
 * *inside* the frame — the problem restated — and reaching the top document needs
 * `allow-top-navigation`, which takes a visitor off the host's site without the host opting in.
 * A new tab is the only honest destination left.
 *
 * ⚠ **It is a default, not a decision.** Per-region canonical ownership (SahajCloud #634) will
 * make the right destination the *owner's* site, and this constant is what stands in until a
 * client record can answer. Resolving it through a function rather than reading
 * `import.meta.env` at the call site is what keeps that a one-line change later.
 *
 * ⚠ **The link carries no route today.** `wemeditate.com/map` serves the legacy hash-routing
 * build until the origin cutover (#148 Part 2), so an appended `?atlas=` is silently dropped —
 * and a link advertising a route it does not honour is worse than one that plainly does not.
 * Revisit in the commit that lands the cutover.
 */

/** Shipped default, and the value every misconfiguration falls back to. */
export const DEFAULT_FALLBACK_URL = 'https://wemeditate.com/map'

/**
 * The configured fallback, or the default when it is missing or not an `https:` URL.
 *
 * **Validated here rather than at the sink, because the sink fails silently and badly.** The
 * `Button` atom's href arm runs `isSafeHref` and, on refusal, renders a props-less `<span>`
 * (`atoms/Button/Button.tsx`) — on a card whose only content is that one control, that is a
 * dead, unlabelled box where the way out should be. A typo'd env var would ship a compact embed
 * with no exit, and nothing would say so.
 */
export function fallbackUrl(
  configured: string | undefined = import.meta.env.VITE_WEMEDITATE_MAP_URL,
): string {
  if (!configured) return DEFAULT_FALLBACK_URL

  try {
    // ⚠ Return the PARSED url, never `configured`. The WHATWG parser strips leading and embedded
    // ASCII tab, LF, CR and spaces before parsing, so validating one string and returning another
    // lets a value through that this function has not actually checked. A leading space — the
    // likeliest `.env` typo — parses clean here and is then refused by `isSafeHref` at the sink,
    // whose scheme test is `^`-anchored, producing exactly the dead unlabelled card the docblock
    // above says this exists to prevent.
    const url = new URL(configured)

    return url.protocol === 'https:' ? url.toString() : DEFAULT_FALLBACK_URL
  } catch {
    return DEFAULT_FALLBACK_URL
  }
}
