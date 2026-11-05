import type { ReactNode } from 'react'

import { DrawerHeader } from '@/components/atoms/Drawer'
import { Event } from '@/types'

export type EventHeaderProps = {
  event: Event
  /** The row above the title: the way back. */
  nav?: ReactNode
  /** The line below the title: where this class sits. */
  below?: ReactNode
}

/**
 * This is the event surface header. It shows only the title. The header
 * renders outside the drawer body, so it stays pinned while content scrolls
 * and so the mobile sheet's 80px peek shows it (issue #52, WS4). The date
 * and location facts open the body, directly under it.
 */
export function EventHeader({ event, nav, below }: EventHeaderProps) {
  return (
    <DrawerHeader stacked>
      {nav}
      <h1 className="line-clamp-3 text-xl break-words">{event.title}</h1>
      {below}
    </DrawerHeader>
  )
}
