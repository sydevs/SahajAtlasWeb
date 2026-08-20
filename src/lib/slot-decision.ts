import type { Box } from './embed-slot'
import type { CompactState } from './compact-state'

import { COMPACT_MESSAGE, embedLayout, resolveDestination } from './embed-slot'
import { compactState } from './compact-state'
import { fallbackUrl } from './fallback-url'

/**
 * The whole slot decision, in one place both entries call (issue #161).
 *
 * **This exists as one composed function because the composition is where the bug was.** The
 * previous shape had three predicates wired together at the call site, and the wiring — not any
 * predicate — suppressed the map-mode warning in exactly the case where it was real. Every
 * predicate was exhaustively specced and the join was wrong, which is the lesson
 * `.claude/rules/tests.md` records about `timeoutStatus`. So the join is the exported thing,
 * and the spec drives it rather than its parts.
 *
 * The DOM reads live here rather than in `embed-slot.ts`, which stays pure so the node lane can
 * table-drive it with no jsdom.
 */
export type SlotInput = {
  /** The element to measure, or `null` where there is nothing to measure (the standalone entry). */
  element: Element | null
  hasMap: boolean
  /** Did the route come from the page's `?atlas=`? Only a page route may open the surface. */
  fromPage: boolean
}

export type SlotDecision = {
  /** `null` when the interface fits — the overwhelmingly common answer. */
  compact: CompactState | null
  /** The one sentence the host's console gets, or `null`. */
  warning: string | null
}

const FULL: SlotDecision = { compact: null, warning: null }

/**
 * Are we inside a frame?
 *
 * A cross-origin parent makes `window.top` throw on access rather than return a foreign window,
 * so the comparison has to be guarded — and a throw here means we are framed.
 */
function framed(): boolean {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

/**
 * How big a new tab would be.
 *
 * ⚠ **`screen.avail*` alone overestimates**, and it is the one input the whole framed path
 * rests on. It reports the *display* minus OS chrome, not the browser window — so a 300×400
 * frame in an 800×600 window on a 1920×1080 monitor would be compared against 1920×1080 and
 * called cramped when a new tab is really 800×600. `window.outer*` reports the top-level
 * browser window's outer size and is readable from inside a cross-origin frame, so the smaller
 * of the two is the honest answer.
 *
 * Both degrade the same way under anti-fingerprinting (Firefox `resistFingerprinting`, Safari
 * Lockdown report the content window), which makes `screen ≈ viewport`, which resolves to no
 * destination and therefore the full interface. Cramped rather than wrong, matching the bias
 * everywhere else — but silent, which is why `slot-decision.test.ts` names that case.
 */
function newTabBox(): Box {
  const outer = { width: window.outerWidth, height: window.outerHeight }
  const avail = { width: window.screen?.availWidth ?? 0, height: window.screen?.availHeight ?? 0 }

  return {
    width: Math.min(outer.width || Infinity, avail.width || Infinity),
    height: Math.min(outer.height || Infinity, avail.height || Infinity),
  }
}

export function decideSlot({ element, hasMap, fromPage }: SlotInput): SlotDecision {
  // Guarded because every read below is of a DOM we do not own, and a host is free to have
  // patched `getBoundingClientRect` — consent wrappers, anti-fingerprinting extensions and page
  // builders all do. This runs during the first render, so an unguarded throw reaches
  // `RootBoundary` and replaces the whole widget with its static rung. A measurement must never
  // break what it measures.
  try {
    const viewport = { width: window.innerWidth, height: window.innerHeight }

    // With no element there is nothing between us and the viewport, so the slot IS the viewport
    // — the standalone build, framed or not. That makes `resolveDestination` fall through to
    // the framed branch on its own, with no special case for the entry.
    const box = element?.getBoundingClientRect()
    const slot = box
      ? {
          // The host's own column is the fallback when our element has no box of its own: in
          // map mode everything below the `display: contents` root is fixed, so it measures 0.
          width: box.width || (element?.parentElement?.getBoundingClientRect().width ?? 0),
          height: box.height,
        }
      : viewport

    const destination = resolveDestination(slot, viewport, newTabBox(), framed())
    const { layout, reason } = embedLayout({ hasMap, slot, destination })

    if (layout === 'full') return FULL

    return {
      compact: compactState({
        destination,
        href: fallbackUrl(),
        // Only a height the HOST wrote is a box to fill. An element they gave none measures 0
        // and must size to the card's own content instead, or it collapses and reads as an
        // embed that did not render.
        fill: (box?.height ?? 0) > 0,
        fromPage,
      }),
      warning: reason ? COMPACT_MESSAGE[reason] : null,
    }
  } catch {
    return FULL
  }
}
