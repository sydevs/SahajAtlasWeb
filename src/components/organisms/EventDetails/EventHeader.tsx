import type { ReactNode } from 'react'

import { DrawerHeader } from '@/components/atoms/Drawer'
import { TitleSkeleton } from '@/components/molecules/Skeleton'
import { useListingTitle } from '@/hooks/use-event-display'
import { Event } from '@/types'

export type ClassHeaderProps = {
  /** The class's title, or nothing while it is still on its way (two placeholder lines). */
  title?: string
  /** The row above the title: the way back. */
  nav?: ReactNode
  /** The line below the title: where this class sits. */
  below?: ReactNode
}

/**
 * A class page's header, from its title alone: the way back, the title, and the line below it.
 * `EventHeader` renders it for a loaded class, and the class's loading placeholder
 * (`views/fallbacks`) renders it with the title it can already tell, or placeholder lines where
 * the title will go, so the header keeps its height and its type when the page arrives.
 */
export function ClassHeader({ title, nav, below }: ClassHeaderProps) {
  return (
    <DrawerHeader stacked>
      {nav}
      {title ? (
        <h1 className="line-clamp-3 text-xl break-words">{title}</h1>
      ) : (
        <TitleSkeleton lines={2} />
      )}
      {below}
    </DrawerHeader>
  )
}

export type EventHeaderProps = Omit<ClassHeaderProps, 'title'> & {
  event: Event
}

/**
 * This is the event surface header. It shows only the title. The header
 * renders outside the drawer body, so it stays pinned while content scrolls
 * and so the mobile sheet's 80px peek shows it (issue #52, WS4). The date
 * and location facts open the body, directly under it. An inactive listing is titled by its town
 * (`useListingTitle`).
 */
export function EventHeader({ event, nav, below }: EventHeaderProps) {
  const title = useListingTitle(event)

  return <ClassHeader below={below} nav={nav} title={title} />
}
