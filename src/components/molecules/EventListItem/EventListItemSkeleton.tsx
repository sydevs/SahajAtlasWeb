import { SkeletonLine } from '@/components/atoms/Skeleton'
import { EventFactsSkeleton } from '@/components/molecules/EventFacts/EventFactsSkeleton'
import {
  EVENT_CARD,
  EVENT_CARD_BODY,
  EVENT_CARD_FACTS,
  EVENT_CARD_TITLE,
  ListRowSkeleton,
} from '@/components/molecules/List/List'

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
    <ListRowSkeleton className={EVENT_CARD}>
      <div className={EVENT_CARD_BODY}>
        <SkeletonLine className={EVENT_CARD_TITLE} width={width} />
        <EventFactsSkeleton className={EVENT_CARD_FACTS} online={online} variant="compact" />
      </div>
    </ListRowSkeleton>
  )
}
