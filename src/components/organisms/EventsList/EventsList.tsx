import { EventListItem } from '@/components/molecules/EventListItem'
import { List } from '@/components/molecules/List'
import { EventSlim } from '@/types'

export interface EventsListProps {
  events: EventSlim[]
  /**
   * The searched place, named in each card's distance line ("3.6 km from Brussels").
   * Read ONCE by the container and passed down rather than read per card: it comes from
   * `?q`, which the geocoder rewrites on every keystroke, and a card that subscribes to
   * the URL re-renders on each one no matter how well it's memoized. With the list now
   * paging to hundreds of rows that is the difference between one re-render and
   * hundreds, on the very interaction most likely to happen over a deep list.
   */
  searchedPlace?: string
}

// The presentational list — events passed in via props, one card each. Kept free
// of the data/i18n graph (its network-bound container is DynamicEventsList) so a
// story can render it without booting the app's query client or i18n backend.
export function EventsList({ events, searchedPlace }: EventsListProps) {
  return (
    <List>
      {events.map((event) => (
        <EventListItem key={event.id} event={event} searchedPlace={searchedPlace} />
      ))}
    </List>
  )
}
