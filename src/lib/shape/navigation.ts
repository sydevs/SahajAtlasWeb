/**
 * In-widget history shaping. The drawer stack is a pure function of the URL, but
 * *dismissal* is history-aware: every in-widget push stamps an incrementing
 * `location.state.depth`, so closing a drawer can go chronologically back
 * (`navigate(-1)`) when there's in-widget history and fall back to the structural
 * parent only for a fresh deep link. Kept here (pure, no react-router import) so
 * the decision is unit-testable in isolation from the components that apply it.
 */

/** The `state` shape we stamp on in-widget pushes (via the Link atom + useAtlasNavigate). */
export type AtlasNavState = { depth?: number }

/**
 * The in-widget history depth carried on a location's `state`. A fresh deep link
 * (or any navigation we didn't stamp) has no numeric depth ⇒ 0. Reads defensively:
 * `state` is `unknown` at the react-router boundary and may be anything a host page
 * put there.
 */
export const atlasDepth = (location: { state?: unknown }): number => {
  const state = location.state as { depth?: unknown } | null | undefined

  return typeof state?.depth === 'number' ? state.depth : 0
}

/** What dismissing the top drawer resolves to. */
export type DismissAction =
  | 'collapse' // the root view (no parent) — collapse the sheet to its peek
  | 'back' // in-widget history exists — go chronologically back (restores camera)
  | 'fallback' // a fresh deep link (depth 0) — climb to the structural parent

/**
 * Resolve the dismiss behaviour from whether a structural parent exists and the
 * current in-widget depth. `back` (never at depth 0) is what keeps the embedded
 * widget from navigating the *host page* away — at depth 0 there's no in-widget
 * entry to pop, so we climb structurally instead.
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
