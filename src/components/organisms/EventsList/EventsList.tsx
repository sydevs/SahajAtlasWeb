import { useSuspenseQuery } from '@tanstack/react-query'
import { DateTime } from 'luxon'
import { useTranslation } from 'react-i18next'

import { EventCard } from '@/components/molecules/EventCard'
import { List } from '@/components/molecules/List'
import { Alert } from '@/components/atoms/Alert'
import { isSoon } from '@/lib'
import { EventSlim } from '@/types'
import { filtersKey, hasActiveFilters, isOnline, nextOccurrence } from '@/lib/shape'
import { useEventFilters, useSearchState } from '@/config/store'
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
  // The active (applied) filters. getEvents applies the shared `matchesFilters`
  // predicate; the map filters its pins/clusters with the same filters, so the
  // list and the map agree. The key includes the filters, so applying a new set
  // refetches (filters are edited in the FilterView drawer, not here).
  const filters = useEventFilters()

  const { data: events } = useSuspenseQuery({
    // Latitude/longitude are rounded to reduce re-fetching when the map moves.
    queryKey: ['events', latitude.toFixed(2), longitude.toFixed(2), filtersKey(filters)],
    queryFn: () =>
      api
        .getEvents(latitude, longitude, filters)
        .then((data) => data.sort((a, b) => calculateOrder(a) - calculateOrder(b))),
  })

  if (events.length === 0) return <EmptyResults />

  return <EventsList events={events} />
}

// Shown when no events match — with a "clear all filters" action when active
// filters are the reason the list is empty.
function EmptyResults() {
  const { t } = useTranslation('common')
  const active = useSearchState((state) => hasActiveFilters(state))
  const clearFilters = useSearchState((state) => state.clearFilters)

  return (
    <div className="p-4">
      <Alert
        color="default"
        description={active ? t('filters.no_results') : t('filters.no_events')}
      >
        {active && (
          <button
            className="mt-2 text-sm font-medium text-primary-11 hover:underline"
            type="button"
            onClick={clearFilters}
          >
            {t('filters.clear')}
          </button>
        )}
      </Alert>
    </div>
  )
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
