import type { ReactNode } from 'react'

import { EVENT_HEADER, EVENT_TITLE } from './EventDetailsSkeleton'

import { Event } from '@/types'

export type EventHeaderProps = {
  event: Event
  /** The row above the title: the way back. */
  nav?: ReactNode
}

/**
 * This is the event surface header: the way back, then the title. The header
 * renders outside the drawer body, so it stays pinned while content scrolls
 * and so the mobile sheet's peek shows it (issue #52, WS4). The triage
 * chips (type, language, Today) open the body instead of sitting here. The
 * date and location facts follow the chips.
 */
export function EventHeader({ event, nav }: EventHeaderProps) {
  return (
    <div className={EVENT_HEADER}>
      {nav}
      <h1 className={EVENT_TITLE}>{event.title}</h1>
    </div>
  )
}
