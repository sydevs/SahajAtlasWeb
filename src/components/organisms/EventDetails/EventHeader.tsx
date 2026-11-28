import type { ReactNode } from 'react'

import { SkeletonGroup, SkeletonLine } from '@/components/organisms/Skeleton/Skeleton'

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
  /** How many lines the bars draw for a title still on its way: the most titles take there. */
  titleLines?: 1 | 2
}

/**
 * This is the event surface header: the way back, then the title. The header
 * renders outside the drawer body, so it stays pinned while content scrolls
 * and so the mobile sheet's peek shows it (issue #52, WS4). The triage
 * chips (EventChips) open the body instead of sitting here. The
 * date and location facts follow the chips.
 */
export function EventHeader({ title, nav, titleLines = 2 }: EventHeaderProps) {
  return (
    <div className={EVENT_HEADER} data-band="header">
      {nav}
      {title ? (
        // An h2, as every view's title is: inline, the page heading above it is the h1 (or the
        // h2 under a host's own), and a second h1 would split the host page's outline.
        <h2 className={EVENT_TITLE}>{title}</h2>
      ) : (
        <SkeletonGroup>
          <SkeletonLine className="text-xl" width="w-4/5" />
          {titleLines === 2 && <SkeletonLine className="text-xl" width="w-2/5" />}
        </SkeletonGroup>
      )}
    </div>
  )
}
