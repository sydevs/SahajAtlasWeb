import { getThemeRoot } from '@/hooks/use-theme'

// Where Radix overlays (Dialog, Select listbox) portal to. They render into the
// theme root so they inherit its brand CSS vars + light/dark class. In the
// embedded widget the root is the widget wrapper (a <div>), so overlays stay
// scoped to it — fixing the long-standing gap where overlays portaled to
// document.body and lost the brand theme. Standalone / Ladle, the root is <html>;
// a <div> can't be a valid child of <html>, so fall back to <body>, which still
// inherits the html-level theme class + vars.
export function overlayContainer(): HTMLElement | undefined {
  // No DOM (node test lane / SSR) → let the overlay fall back to its default.
  if (typeof document === 'undefined') return undefined

  const root = getThemeRoot()

  return root === document.documentElement ? document.body : root
}
