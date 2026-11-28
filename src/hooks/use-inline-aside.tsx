import { type ReactNode, createContext, useContext } from 'react'
import { createPortal } from 'react-dom'

const InlineAsideContext = createContext<HTMLElement | null>(null)

/**
 * The box under the inline embed's map, for what a view shows beside the map rather than in its
 * column: a class's Register and actions. `null` in a drawer and in a map-less embed, where the
 * view keeps them in its own flow.
 *
 * Its own module, free of the map, because EventView and the class panel read it.
 */
export const InlineAsideProvider = InlineAsideContext.Provider

export const useInlineAside = () => useContext(InlineAsideContext)

/** Renders its children under the inline map, or nothing where there is no such box. */
export function InlineAside({ children }: { children: ReactNode }) {
  const target = useInlineAside()

  return target && createPortal(children, target)
}

const InlineAboveContext = createContext<HTMLElement | null>(null)

/**
 * The box above the inline embed's page heading, for what a view leads with ahead of that
 * heading: a class's way back, since the heading names the class. `null` anywhere else.
 */
export const InlineAboveProvider = InlineAboveContext.Provider

export const useInlineAbove = () => useContext(InlineAboveContext)

/** Renders its children above the inline page heading, or nothing where there is no such box. */
export function InlineAbove({ children }: { children: ReactNode }) {
  const target = useInlineAbove()

  return target && createPortal(children, target)
}
