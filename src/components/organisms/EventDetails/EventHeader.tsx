import type { ReactNode } from 'react'

import { EventChips } from '@/components/molecules/EventChips'
import { Event } from '@/types'

export type EventHeaderProps = {
  event: Event
  /** Trailing header control (the drawer close button). */
  trailing?: ReactNode
}

/**
 * The event surface header: title + the triage chips (`EventChips` — type ·
 * language(s) · Today). Rendered OUTSIDE the drawer body so the mobile sheet's
 * 80px peek shows exactly this triage payload (issue #52, WS4) — and the title
 * stays pinned while content scrolls. The when/where facts live in the panel
 * body below.
 */
export function EventHeader({ event, trailing }: EventHeaderProps) {
  return (
    <div className="flex shrink-0 flex-col gap-1.5 px-6 pb-2 pt-1 md:pt-4">
      <div className="flex items-start justify-between gap-2">
        <h1 className="line-clamp-3 text-lg font-semibold leading-6 tracking-wide">
          {event.title}
        </h1>
        {trailing}
      </div>
      <EventChips event={event} variant="default" />
    </div>
  )
}
