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
  /** Names each row by town and distance. See `placeLine` on `EventListItem`. */
  placeLineFor?: (event: EventSlim) => string | undefined
  /** Leaves the distance off every row. See `hideDistance` on `EventListItem`. */
  hideDistance?: boolean
  /** Reads each row's distance from the middle of the place. See `fromCentre` on `EventListItem`. */
  fromCentre?: boolean
}

// This is the presentational list: events pass in via props, one card each.
// It stays free of the data and i18n graph — its network-bound container is
// DynamicEventsList — so a story can render it without booting the app's
// query client or i18n backend.
export function EventsList({
  events,
  searchedPlace,
  placeLineFor,
  hideDistance,
  fromCentre,
}: EventsListProps) {
  return (
    <List>
      {events.map((event) => (
        <EventListItem
          key={event.id}
          event={event}
          fromCentre={fromCentre}
          hideDistance={hideDistance}
          placeLine={placeLineFor?.(event)}
          searchedPlace={searchedPlace}
        />
      ))}
    </List>
  )
}
