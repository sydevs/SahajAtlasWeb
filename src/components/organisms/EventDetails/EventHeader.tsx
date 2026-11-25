import type { ReactNode } from 'react'

import { Skeleton, SkeletonLine } from '@/components/atoms/Skeleton/Skeleton'

const EVENT_HEADER = 'flex shrink-0 flex-col px-gutter pt-1 pb-2 md:pt-4'
const EVENT_TITLE = 'line-clamp-3 text-xl break-words'

export type EventHeaderProps = {
  /**
   * The class's name. Without it the header draws the title's lines as bars instead, and no
   * heading: a heading with nothing in it is worse than none.
   */
  title?: string
  /** The row above the title: the way back, which works before the class arrives. */
  nav?: ReactNode
}

/**
 * This is the event surface header: the way back, then the title. The header
 * renders outside the drawer body, so it stays pinned while content scrolls
 * and so the mobile sheet's peek shows it (issue #52, WS4). The triage
 * chips (type, language, Today) open the body instead of sitting here. The
 * date and location facts follow the chips.
 */
export function EventHeader({ title, nav }: EventHeaderProps) {
  return (
    <div className={EVENT_HEADER}>
      {nav}
      {title ? (
        <h1 className={EVENT_TITLE}>{title}</h1>
      ) : (
        <Skeleton>
          <SkeletonLine className="text-xl" width="w-4/5" />
          <SkeletonLine className="text-xl" width="w-2/5" />
        </Skeleton>
      )}
    </div>
  )
}
