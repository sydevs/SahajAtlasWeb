import { SkeletonLine } from '@/components/atoms/Skeleton'
import { EventFactsSkeleton } from '@/components/molecules/EventFacts/EventFactsSkeleton'
import { ListRowSkeleton } from '@/components/molecules/List/List'

/** Shared with `EventListItem`, so a card's placeholder and the card cannot drift apart. */
export const EVENT_CARD = 'py-4'
// `min-w-0` lets a truncating chip or an unbroken title shrink instead of pushing the chevron out.
export const EVENT_CARD_BODY = 'flex min-w-0 flex-1 flex-col gap-1'
export const EVENT_CARD_TITLE = 'line-clamp-2 text-lg'
export const EVENT_CARD_FACTS = 'mt-0.5 mb-1'

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
