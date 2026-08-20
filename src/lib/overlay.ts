import { getThemeRoot } from '@/hooks/use-theme'

// Where Radix overlays (Dialog, Select listbox) portal to. They render into the
// theme root so they inherit its brand CSS vars + light/dark class. In the
// embedded widget the root is the widget wrapper (a <div>), so overlays stay
// scoped to it — fixing the long-standing gap where overlays portaled to
// document.body and lost the brand theme. Standalone / Ladle, the root is <html>;
// a <div> can't be a valid child of <html>, so fall back to <body>, which still
// inherits the html-level theme class + vars.

/**
 * The expanded surface, while one is open (issue #161) — and the ONE reason this module
 * has state rather than being a pure read of the theme root.
 *
 * A compact embed expands into a modal Radix Dialog, and a modal dialog is not merely a
 * layer painted on top: it traps focus inside its content, marks everything outside it
 * `aria-hidden`, and blocks pointer events there. So an overlay that portaled to the theme
 * root while the surface is open would land OUTSIDE the dialog — and the drawer stack, which
 * is the whole interface being expanded, would be unreachable by keyboard and inert to a
 * screen reader. Redirecting every portal into the surface is what makes the expanded widget
 * one coherent layer instead of two fighting ones.
 *
 * It is a module singleton for the same reason the theme root is: `overlayContainer()` is
 * called from component render bodies all over the app, including from inside third-party
 * portals (vaul, Floating UI) that no context of ours reaches. One widget runs per page
 * (`Widget.tsx` enforces it), so one surface is the honest shape.
 */
let expandedSurface: HTMLElement | null = null

/**
 * Adopt (or release, with `null`) the expanded dialog as the portal target.
 *
 * **Called during the layout phase, before the surface's children render**, which is the
 * whole timing constraint: `overlayContainer()` is read in a render body, so a target
 * published in a passive effect would arrive one commit too late and the first drawer would
 * portal itself outside the dialog it is supposed to live in.
 */
export function setDialog(element: HTMLElement | null): void {
  expandedSurface = element
}

/**
 * The expanded dialog, when one is mounted and still in the document.
 *
 * Exposed so a caller needing the dialog's own box reads the node we already track, instead of
 * `document.querySelector('[data-sy-expanded]')` — that searches the HOST's document, where an
 * element of theirs carrying the attribute would win on document order and silently become the
 * frame every sheet measures against.
 */
export function expandedDialog(): HTMLElement | null {
  return expandedSurface?.isConnected ? expandedSurface : null
}

/**
 * The theme-scoped root, ignoring any expanded surface.
 *
 * The surface itself has to portal somewhere, and that somewhere cannot be itself — so the
 * one caller that must not see the override reads this instead.
 */
export function widgetOverlayContainer(): HTMLElement | undefined {
  // No DOM (node test lane / SSR) → let the overlay fall back to its default.
  if (typeof document === 'undefined') return undefined

  const root = getThemeRoot()

  return root === document.documentElement ? document.body : root
}

export function overlayContainer(): HTMLElement | undefined {
  // Guarded on `isConnected` rather than trusted: releasing is somebody else's `useEffect`
  // cleanup, and a stale detached node would silently swallow every portal in the app.
  if (expandedSurface?.isConnected) return expandedSurface

  return widgetOverlayContainer()
}
