import { getThemeRoot } from '@/hooks/use-theme'

// Where Radix overlays (Dialog, Select listbox) portal to. They render into
// the theme root, so they inherit its brand CSS vars and light/dark class.
// In the embedded widget the root is the widget wrapper (a <div>), so
// overlays stay scoped to it. This fixes the long-standing gap where
// overlays portaled to document.body and lost the brand theme. Standalone
// or Ladle, the root is <html>. A <div> cannot be a valid child of <html>,
// so this falls back to <body>, which still inherits the html-level theme
// class and vars.

/**
 * The widget's FRAME: the element the fixed layer resolves against, when something other
 * than the viewport does.
 *
 * Everything the interface renders — the map canvas, every drawer, the peek strips, the cog —
 * is `position: fixed`, so by default it all resolves against the viewport. An ancestor
 * carrying `contain: layout` takes that containing block instead, and the widget has exactly
 * two elements that deliberately do so. This is the one reference to whichever is live, and the
 * ONE reason this module has state rather than being a pure read of the theme root.
 *
 * - **The expanded dialog** (`CompactEmbedView`, issue #161) — a compact embed grows out of its
 *   slot into a modal Radix Dialog over the host's page.
 * - **`MapFrame`** (issue #169) — a map embed whose host gave the element a box of its own,
 *   so the map lives *in* their page instead of painting over it.
 *
 * **Both need this for the same mechanical reason, and the dialog needs it for a second one.**
 * Mechanically, a portal target outside the frame renders a `fixed` child that resolves against
 * the viewport and escapes the box — the map is contained and its drawers are not. On top of
 * that, a modal dialog traps focus in its own content, marks everything outside it
 * `aria-hidden` and blocks pointer events there, so a drawer portaled beside it would be
 * unreachable by keyboard as well as misplaced.
 *
 * It is a module singleton for the same reason the theme root is: `overlayContainer()` is
 * called from component render bodies all over the app, including from inside third-party
 * portals (vaul, Floating UI) that no context of ours reaches. One widget runs per page
 * (`Widget.tsx` enforces it), and the two frames are mutually exclusive — a compact embed does
 * not render the interface until its dialog opens, and `decideSlot` never answers `contained`
 * and `compact` together — so one frame is the honest shape.
 */
let frame: HTMLElement | null = null

/**
 * Adopt (or release, with `null`) an element as the widget's frame and portal target.
 *
 * **Called during the layout phase, before the frame's children render**, which is the
 * whole timing constraint: `overlayContainer()` is read in a render body, so a target
 * published in a passive effect would arrive one commit too late and the first drawer would
 * portal itself outside the frame it is supposed to live in.
 */
export function setFrame(element: HTMLElement | null): void {
  frame = element
}

/**
 * The frame, when one is mounted and still in the document — otherwise `null`, meaning the
 * fixed layer resolves against the viewport.
 *
 * Exposed so a caller needing the frame's own box (vaul's snap measurement, the
 * `--sy-sheet-top` mirror, the widget's own width) reads the node we already track, instead of
 * `document.querySelector('[data-sy-frame]')` — that searches the HOST's document, where an
 * element of theirs carrying the attribute would win on document order and silently become the
 * box every sheet measures against.
 */
export function frameElement(): HTMLElement | null {
  // Guarded on `isConnected` rather than trusted: releasing is somebody else's ref detach, and a
  // stale detached node would silently swallow every portal in the app — and become a 0×0 box
  // for vaul to measure snap points against. `overlayContainer()` funnels through here so there
  // is one definition of "a live frame".
  return frame?.isConnected ? frame : null
}

/**
 * The collision boundary a Radix popper needs to stay inside the frame (#169).
 *
 * ⚠ **Radix's popper defaults to an EMPTY boundary, which Floating UI reads as the viewport.**
 * That was right while the widget owned the viewport and is wrong the moment a frame contains it:
 * a menu opened near the bottom of a 640px contained map sees hundreds of pixels of free browser
 * window below its trigger, places itself there, and the frame's `overflow-hidden` erases it. The
 * control then appears to do nothing, with nothing in the console.
 *
 * `null` is filtered out by Radix, so with no frame this is exactly today's behaviour.
 *
 * **Spread it at every Radix popper surface**, which `overlay.popper.test.ts` pins as a closed
 * list — the cog offset in `DrawerStack` was fixed one place and missed another on this very
 * branch, and five call sites is precisely where that happens again.
 *
 * Floating UI surfaces (`atoms/Dropdown`, `use-popover`) need none of this: their own default is
 * `clippingAncestors`, which already respects the frame.
 */
export function frameCollision(): { collisionBoundary: HTMLElement | null } {
  return { collisionBoundary: frameElement() }
}

/**
 * The theme-scoped root, ignoring any frame.
 *
 * The frame itself has to portal somewhere, and that somewhere cannot be itself — so the
 * one caller that must not see the override reads this instead.
 */
export function widgetOverlayContainer(): HTMLElement | undefined {
  // No DOM (node test lane / SSR) → let the overlay fall back to its default.
  if (typeof document === 'undefined') return undefined

  const root = getThemeRoot()

  return root === document.documentElement ? document.body : root
}

export function overlayContainer(): HTMLElement | undefined {
  return frameElement() ?? widgetOverlayContainer()
}
