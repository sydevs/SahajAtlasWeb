import type { LivePreviewTarget } from './messages'

import { RESERVED_SLUGS, resolvePath } from '@/lib/shape'

/**
 * Pure navigation guards for live preview (issue #40). The React wrappers — a capture-phase
 * anchor guard and a route lock — live in `<LivePreviewController>`. These are the testable
 * predicates behind them. The names match WeMeditateWeb's `lib/live-preview/navigation.ts`,
 * which guards the same session against the same CMS.
 */

/**
 * Whether an anchor's raw `href` should be inerted in preview. Everything navigates
 * away from the previewed doc except a same-page `#hash` (a table-of-contents scroll),
 * and a missing or empty href does not navigate at all. This reads the raw attribute,
 * not the resolved `.href` property, so a bare `#heading` stays detectable.
 */
export function shouldBlockPreviewLink(rawHref: string | null | undefined): boolean {
  if (!rawHref) return false
  if (rawHref.startsWith('#')) return false

  return true
}

/**
 * The routes the preview is allowed to sit on, anchored at the previewed doc's own page.
 * An event may also open its register/share drawers. A region is pinned to its own page.
 * Anything else — a subregion, another event, a dismissed drawer landing on a parent —
 * snaps back to `previewPath`.
 */
export function allowedLivePreviewPaths(previewPath: string, kind: 'event' | 'region'): string[] {
  if (kind === 'event') {
    // The event's over-drawers — mirrors the register/share entries resolveStack
    // appends (src/lib/shape/path.ts). Keep in sync if an event gains another.
    return [previewPath, `${previewPath}/register`, `${previewPath}/share`]
  }

  return [previewPath]
}

/**
 * The document a live-preview URL names, or `null` when it names none.
 *
 * ⚠ **`resolvePath` alone is not enough here, and its own docblock says so**: it reads the
 * terminal segment as a region slug whatever the segment is, so `/preview` would resolve to a
 * region called "preview" and the controller would try to render it. Every routed word is
 * already enumerated in `RESERVED_SLUGS`, `'preview'` included, so one guard covers the boot
 * route and `/…/register` and `/…/share` at the same time.
 *
 * `/preview` resolving to nothing is the CORRECT answer, not a gap: it is the boot route for
 * `event-submissions`, whose render-ready shape rides the message payload rather than the
 * path (`config/live-preview/protocol.ts`). There is no document in that URL to key on.
 */
export function resolveLivePreviewTarget(pathname: string): LivePreviewTarget | null {
  const terminal = pathname.split('/').filter(Boolean).at(-1)

  if (!terminal || RESERVED_SLUGS.has(terminal.toLowerCase())) return null

  return resolvePath(pathname)
}
