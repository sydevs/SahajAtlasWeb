import { type ReactNode, createContext, useContext, useMemo, useState } from 'react'

// The expansion seam (issue #161), the same shape as the camera seam in
// `use-map-controller.tsx` and for the same reason: components call these
// *unconditionally*, and exactly one place knows whether expansion is possible.
// A compact card asks to be expanded without knowing whether it is sitting in a
// page (the Radix overlay below), in a frame (the provider that lands with E1/E2),
// or in a surface that is already the whole viewport (the no-op).
export type Expansion = {
  /**
   * Is there anywhere bigger to go? False in the standalone build and in a full-form
   * embed, where the widget already occupies everything it can.
   *
   * A consumer reads this to decide whether to OFFER expansion, never to decide what to
   * render — `expand()` is safe to call either way.
   */
  canExpand: boolean
  /** Is the widget currently expanded? */
  expanded: boolean
  expand: () => void
  collapse: () => void
}

const NOOP: Expansion = {
  canExpand: false,
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
 * A third provider — the framed one, which posts the request to a parent document that owns
 * the viewport — lands with E1/E2 of the white-label programme. Nothing here needs to change
 * for it: `canExpand` is already the question a consumer asks, and `expand()` is already
 * allowed to be asynchronous from the caller's point of view.
 */
export function LocalExpansionProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  const value = useMemo<Expansion>(
    () => ({
      canExpand: true,
      expanded,
      expand: () => setExpanded(true),
      collapse: () => setExpanded(false),
    }),
    [expanded],
  )

  return <ExpansionContext.Provider value={value}>{children}</ExpansionContext.Provider>
}
