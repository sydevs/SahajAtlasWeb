import type { ReactNode } from 'react'

import { MemoryRouter, UNSAFE_LocationContext } from 'react-router'

export type StoryAddressProps = {
  /** The address this section's components read and write: a path with its query. */
  path: string
  children: ReactNode
}

// A router of its own for one section of a story, so sections side by side can each show the
// state a different address puts a URL-driven component in, and each stays live to its own taps.
// ⚠ react-router refuses a <Router> inside another, and the decorator already renders one
// (`.ladle/components.tsx`). Clearing the location context first is what lets this nest; it is
// story-only, and never belongs in app code.
export function StoryAddress({ path, children }: StoryAddressProps) {
  return (
    <UNSAFE_LocationContext.Provider value={null as any}>
      <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    </UNSAFE_LocationContext.Provider>
  )
}
