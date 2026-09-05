/**
 * In-widget history shaping. The drawer stack is a pure function of the URL, but
 * *dismissal* is history-aware: every in-widget push stamps an incrementing
 * `location.state.depth`, so closing a drawer can go chronologically back
 * (`navigate(-1)`) when in-widget history exists, and fall back to the structural
 * parent only for a fresh deep link. This is kept here (pure, no react-router
 * import), so the decision is unit-testable in isolation from the components
 * that apply it.
 */

/** The `state` shape we stamp on in-widget pushes (via the Link atom + useAtlasNavigate). */
export type AtlasNavState = { depth?: number }

/**
 * The in-widget history depth carried on a location's `state`. A fresh deep link
 * (or any navigation we did not stamp) has no numeric depth, so it reads as 0.
 * This reads defensively: `state` is `unknown` at the react-router boundary, and
 * may be anything a host page put there.
 */
export const atlasDepth = (location: { state?: unknown }): number => {
  const state = location.state as { depth?: unknown } | null | undefined

  return typeof state?.depth === 'number' ? state.depth : 0
}

/**
 * The `state` to stamp on an in-widget push: one level deeper than the current
 * entry. The single definition of the depth-stamp convention, shared by the Link
 * atom (declarative `state` prop) and `useAtlasNavigate` (imperative), so the two
 * paths cannot silently diverge. Pair it with `rememberCamera(location.key)` at
 * click time, so a later back restores the camera. That stays a separate call,
 * because Link stamps `state` at render but can only capture the live camera on click.
 */
export const atlasPushState = (location: { state?: unknown }): AtlasNavState => ({
  depth: atlasDepth(location) + 1,
})

/** What dismissing the top drawer resolves to. */
export type DismissAction =
  | 'collapse' // the root view (no parent) — collapse the sheet to its peek
  | 'back' // in-widget history exists — go chronologically back (restores camera)
  | 'fallback' // a fresh deep link (depth 0) — climb to the structural parent

/**
 * Resolve the dismiss behaviour from whether a structural parent exists and the
 * current in-widget depth. `back` (never at depth 0) is what keeps the embedded
 * widget from navigating the *host page* away. At depth 0 there is no in-widget
 * entry to pop, so this climbs structurally instead.
 */
export const dismissAction = ({
  hasParent,
  depth,
}: {
  hasParent: boolean
  depth: number
}): DismissAction => {
  if (!hasParent) return 'collapse'

  return depth > 0 ? 'back' : 'fallback'
}

/**
 * How many panels a repeated dismiss actually traverses before the stack
 * collapses — i.e. how many drawers are genuinely behind the active view. This is
 * what the peek strips must count, and it is NOT the URL's ancestor count.
 *
 * Dismissal is history-aware (see `dismissAction`): while in-widget depth remains,
 * each press goes chronologically BACK one entry, and only once depth reaches 0
 * does it begin climbing structural parents. So a pin clicked from the root view
 * lands at depth 1 with three URL ancestors, yet ONE press returns to the root —
 * rendering three stacked panels there was a lie about where X would take you.
 *
 * `entryAncestors` is the structural ancestor count of the last depth-0 location:
 * the deep link the widget opened on, or whatever a back/climb has returned to.
 * Those are the parents still left to climb once history runs out, so the total is
 * `depth + entryAncestors`. Capped at the current URL's `ancestors`, which is all
 * the stack can actually name — a sibling jump (say a search result in another
 * country) can push depth past the new branch's structural height.
 */
export const dismissDepth = ({
  depth,
  entryAncestors,
  ancestors,
}: {
  depth: number
  entryAncestors: number
  ancestors: number
}): number => Math.max(0, Math.min(ancestors, depth === 0 ? ancestors : depth + entryAncestors))
