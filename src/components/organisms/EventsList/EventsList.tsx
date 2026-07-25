import { EventListItem } from '@/components/molecules/EventListItem'
import { List } from '@/components/molecules/List'
import { EventSlim } from '@/types'

export interface EventsListProps {
  events: EventSlim[]
}

// The presentational list — events passed in via props, one card each. Kept free
// of the data/i18n graph (its network-bound container is DynamicEventsList) so a
// story can render it without booting the app's query client or i18n backend.
export function EventsList({ events }: EventsListProps) {
  return (
    <List>
      {events.map((event) => (
        <EventListItem key={event.id} event={event} />
      ))}
    </List>
  )
}
