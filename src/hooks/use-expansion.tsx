import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react'

// The expansion seam (issue #161), the same shape as the camera seam in
// `use-map-controller.tsx` and for the same reason: components call these
// *unconditionally*, and exactly one place knows whether expansion is possible.
// A compact card asks to be expanded without knowing whether it is sitting in a
// page (the Radix overlay below), in a frame (the provider that lands with E1/E2),
// or in a surface that is already the whole viewport (the no-op).
export type Expansion = {
  /** Is the widget currently expanded? */
  expanded: boolean
  expand: () => void
  collapse: () => void
}

const NOOP: Expansion = {
  expanded: false,
  expand: () => {},
  collapse: () => {},
}

const ExpansionContext = createContext<Expansion>(NOOP)

export const useExpansion = () => useContext(ExpansionContext)

/**
 * Nowhere bigger to go: the standalone build, a Ladle story, and every embed rendering the
 * full interface already.
 *
 * The default context value is this same object, so a subtree with no provider above it
 * behaves identically — a component that never heard of expansion cannot be broken by it.
 */
export function NoExpansionProvider({ children }: { children: ReactNode }) {
  return <ExpansionContext.Provider value={NOOP}>{children}</ExpansionContext.Provider>
}

/**
 * Expansion in the host's own page: the widget grows out of its slot and covers the
 * viewport, then comes back.
 *
 * It owns only the boolean. **What that boolean draws is the caller's**, which is what keeps
 * the full interface out of the render tree while collapsed — the whole point of the compact
 * form is that mapbox-gl is never fetched. A provider that rendered the expanded content
 * itself would have to receive it as a prop and would still not be able to promise that.
 *
 * **There is deliberately no framed provider.** A frame cannot expand — `position: fixed`
 * resolves against the frame, so an overlay would cover the same undersized box the card is
 * already in. A framed embed too small for the interface gets an anchor to somewhere that fits
 * instead (`lib/fallback-url.ts`), which needs no provider at all: `CompactEmbedView` renders the
 * card under `NoExpansionProvider`, and the Escape ladder in `DrawerStack` correctly finds
 * nothing above it to collapse.
 *
 * `autoOpen` starts expanded, for a visitor who arrived on a route rather than a host who
 * configured one. ⚠ It is a **seed, not a prop that tracks** — remounting the element must not
 * reopen a surface the visitor closed, so it is read once by `useState`'s initialiser and the
 * module flag below makes that true even across a remount within one document.
 */

/**
 * Has a surface already auto-opened in this document?
 *
 * Module scope, so a host SPA that unmounts and remounts the element cannot re-open what
 * somebody closed. Deliberately NOT reset on unmount: within one document, once is the promise.
 * A reload is a new document and a new module, and restoring the route there is correct —
 * `?atlas=` surviving a reload means the visitor is still on that route.
 */
let autoOpened = false

export function LocalExpansionProvider({
  autoOpen = false,
  children,
}: {
  autoOpen?: boolean
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(autoOpen && !autoOpened)

  // ⚠ The latch is an EFFECT, never the `useState` initialiser it started as. React double-
  // invokes initialisers under `<StrictMode>` (which `providers.tsx` mounts unconditionally) and
  // keeps the SECOND result — so an initialiser that set the flag on pass 1 returned `false` on
  // pass 2, and auto-open silently never fired in dev, Ladle, or any discarded render. Verified
  // by running it: committed state `false`, flag `true`. An effect runs only for a commit that
  // survived, which is exactly the event "this document has auto-opened once" should mean.
  useEffect(() => {
    if (expanded) autoOpened = true
  }, [expanded])

  const value = useMemo<Expansion>(
    () => ({
      expanded,
      expand: () => setExpanded(true),
      collapse: () => setExpanded(false),
    }),
    [expanded],
  )

  return <ExpansionContext.Provider value={value}>{children}</ExpansionContext.Provider>
}
