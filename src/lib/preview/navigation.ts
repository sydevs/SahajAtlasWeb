/**
 * Pure navigation guards for live preview (issue #40). The React wrappers (a
 * capture-phase anchor guard + a route lock) live in `<PreviewController>`; these are
 * the testable predicates behind them.
 */

/**
 * Whether an anchor's raw `href` should be inerted in preview. Everything navigates
 * away from the previewed doc except a same-page `#hash` (a table-of-contents scroll),
 * and a missing/empty href doesn't navigate at all. Reads the raw attribute, not the
 * resolved `.href` property, so a bare `#heading` stays detectable.
 */
export function shouldBlockPreviewLink(rawHref: string | null | undefined): boolean {
  if (!rawHref) return false
  if (rawHref.startsWith('#')) return false

  return true
}

/**
 * The routes the preview is allowed to sit on, anchored at the previewed doc's
 * canonical `previewPath`. An event may also open its register/share drawers; a region
 * is pinned to its own page. Anything else — a subregion, another event, a dismissed
 * drawer landing on a parent — snaps back to `previewPath`.
 */
export function allowedPreviewPaths(
  previewPath: string,
  collection: 'events' | 'regions',
): string[] {
  if (collection === 'events') {
    return [previewPath, `${previewPath}/register`, `${previewPath}/share`]
  }

  return [previewPath]
}
