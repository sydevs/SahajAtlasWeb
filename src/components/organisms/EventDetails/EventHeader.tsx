import type { ReactNode } from 'react'

import { Event } from '@/types'

export type EventHeaderProps = {
  event: Event
  /** Trailing header control (the drawer close button). */
  trailing?: ReactNode
}

/**
 * The event surface header: the title alone. Rendered OUTSIDE the drawer body so
 * it stays pinned while content scrolls, and so the mobile sheet's 80px peek
 * shows it (issue #52, WS4). The triage chips (type · language(s) · Today) open
 * the body instead of sitting here, and the when/where facts follow them.
 */
export function EventHeader({ event, trailing }: EventHeaderProps) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-2 px-6 pb-2 pt-1 md:pt-4">
      <h1 className="line-clamp-3 text-lg font-semibold leading-6 tracking-wide">{event.title}</h1>
      {trailing}
    </div>
  )
}
