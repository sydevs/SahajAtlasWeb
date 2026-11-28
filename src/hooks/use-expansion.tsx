import { type ReactNode, createContext, useContext, useMemo, useState } from 'react'

// This is the expansion seam. See issue #161.
// It has the same shape as the camera seam in `use-map-controller.tsx`, for the same reason.
// Components call these functions UNCONDITIONALLY, and exactly one place knows whether expansion is possible:
// the inline embed, whose map opens over the page, or a surface that is already the whole viewport, the no-op.
export type Expansion = {
  /** This is whether the widget is currently expanded. */
  expanded: boolean
  expand: () => void
  collapse: () => void
}

const NOOP: Expansion = {
  expanded: false,
  expand: () => {},
  collapse: () => {},
}

// The default: nowhere bigger to go — the map-first page, a Ladle story — so a component that never
// heard of expansion cannot be broken by it.
const ExpansionContext = createContext<Expansion>(NOOP)

export const useExpansion = () => useContext(ExpansionContext)

/**
 * This is expansion in the host's own page: the inline embed's map opens over the page, then comes back.
 *
 * It owns only the boolean. **What that boolean draws is the caller's job.**
 *
 * **There is deliberately no framed provider.**
 * A frame cannot expand. `position: fixed` resolves against the frame, so an overlay would cover the same box the embed is already in.
 * A framed embed's "Expand map" is an anchor to somewhere that fits instead, in `lib/fallback-url.ts`, and the Escape ladder in `DrawerStack` correctly finds nothing to collapse.
 */
export function LocalExpansionProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false)

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
