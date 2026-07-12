import { useSuspenseQuery } from '@tanstack/react-query'
import { DateTime } from 'luxon'
import { useShallow } from 'zustand/react/shallow'

import { EventCard } from '@/components/molecules/EventCard'
import { List } from '@/components/molecules/List'
import { isSoon } from '@/lib'
import { EventSlim } from '@/types'
import { filtersKey, isOnline, nextOccurrence } from '@/lib/shape'
import { useSearchState } from '@/config/store'
import api from '@/config/api'
import i18n from '@/config/i18n'

export interface DynamicEventsListProps {
  latitude: number
  longitude: number
}

function calculateOrder(event: EventSlim) {
  let order = event.distance || 100
  const online = isOnline(event)
  const languageCode = event.languages[0] ?? ''
  const next = nextOccurrence(event)

  if (i18n.resolvedLanguage != languageCode) order *= 2
  if (next && isSoon(DateTime.fromJSDate(next), online)) order *= 0.5
  if (online) order *= 1.5

  return order
}

export function DynamicEventsList({ latitude, longitude }: DynamicEventsListProps) {
  // The active filters, as a stable-identity slice (useShallow). getEvents applies
  // the shared `matchesFilters` predicate; the map filters its pins/clusters with
  // the same filters, so the list and the map always agree. The key includes the
  // filters, so changing one refetches — SearchView wraps this list in its own
  // Suspense boundary so only the list reloads, not the header + filter panel.
  const filters = useSearchState(
    useShallow((state) => ({
      format: state.format,
      timeOfDay: state.timeOfDay,
      daysOfWeek: state.daysOfWeek,
      languages: state.languages,
      cadence: state.cadence,
    })),
  )

  const { data: events } = useSuspenseQuery({
    // Latitude/longitude are rounded to reduce re-fetching when the map moves.
    queryKey: ['events', latitude.toFixed(2), longitude.toFixed(2), filtersKey(filters)],
    queryFn: () =>
      api
        .getEvents(latitude, longitude, filters)
        .then((data) => data.sort((a, b) => calculateOrder(a) - calculateOrder(b))),
  })

  return <EventsList events={events} />
}

export interface EventsListProps {
  events: EventSlim[]
}

export function EventsList({ events }: EventsListProps) {
  return (
    <List>
      {events.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </List>
  )
}
