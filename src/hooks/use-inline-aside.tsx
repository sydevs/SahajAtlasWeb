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
