import { SkeletonLine } from '@/components/atoms/Skeleton'
import { EventFactsSkeleton } from '@/components/molecules/EventFacts/EventFactsSkeleton'

/** Shared with `EventListItem`, so a card's placeholder and the card cannot drift apart. */
export const EVENT_CARD = 'flex flex-col gap-1.5 py-4'
export const EVENT_CARD_TITLE = 'line-clamp-2 text-lg'

export interface EventListItemSkeletonProps {
  /** The title's width, so a column of cards doesn't read as one block. */
  width?: string
  /** A list of online classes: the where line carries the monitor. */
  online?: boolean
}

/** `EventListItem` before its class is known: the title, then the when and where lines. */
export function EventListItemSkeleton({
  width = 'w-3/5',
  online = false,
}: EventListItemSkeletonProps) {
  return (
    <li>
      {/* The row's gutter without `listRow`'s hover and press states: nothing here is a link. */}
      <div className={`px-gutter ${EVENT_CARD}`}>
        <SkeletonLine className={EVENT_CARD_TITLE} width={width} />
        <EventFactsSkeleton online={online} variant="compact" />
      </div>
    </li>
  )
}
