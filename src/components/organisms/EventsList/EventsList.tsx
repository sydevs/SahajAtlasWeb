import { useSuspenseQuery } from '@tanstack/react-query'
import { DateTime } from 'luxon'
import { useTranslation } from 'react-i18next'

import { EventCard } from '@/components/molecules/EventCard'
import { List } from '@/components/molecules/List'
import { ActiveFilterPills } from '@/components/molecules/ActiveFilterPills'
import { Alert } from '@/components/atoms/Alert'
import { isSoon } from '@/lib'
import { EventSlim } from '@/types'
import { filtersKey, hasActiveFilters, isOnline, nextOccurrence } from '@/lib/shape'
import { useEventFilters, useSetFilters } from '@/hooks/use-filters'
import { useLocale } from '@/hooks/use-locale'
import api from '@/config/api'
import i18n from '@/config/i18n'

// Cap the search results at this distance from a searched location; when farther
// (in-person) events would otherwise show, a dismissable "< N km" pill appears.
const NEARBY_KM = 500

export interface DynamicEventsListProps {
  latitude: number
  longitude: number
  /** Whether latitude/longitude came from a geocoded search (vs the map centre). */
  hasSearchCenter?: boolean
  /** Whether the "< NEARBY_KM" cap has been dismissed (URL-driven, so it survives
   *  the drawer stack's remount-on-navigation and resets on a new search). */
  showAll?: boolean
  onShowAll?: () => void
}

function calculateOrder(event: EventSlim) {
  let order = event.distance ?? 100
  const online = isOnline(event)
  const languageCode = event.languages[0] ?? ''
  const next = nextOccurrence(event)

  if (i18n.resolvedLanguage != languageCode) order *= 2
  if (next && isSoon(DateTime.fromJSDate(next), online)) order *= 0.5
  if (online) order *= 1.5

  return order
}

export function DynamicEventsList({
  latitude,
  longitude,
  hasSearchCenter = false,
  showAll = false,
  onShowAll,
}: DynamicEventsListProps) {
  // The active (applied) filters. getEvents applies the shared `matchesFilters`
  // predicate; the map filters its pins/clusters with the same filters, so the
  // list and the map agree. The key includes the filters, so applying a new set
  // refetches (filters are edited in the FilterView drawer, not here).
  const filters = useEventFilters()
  const { locale } = useLocale()
  const { t } = useTranslation('events')

  const { data: events } = useSuspenseQuery({
    // Latitude/longitude are rounded to reduce re-fetching when the map moves; the
    // locale keys the (localized) titles the list shows, so a switch refetches.
    queryKey: ['events', latitude.toFixed(2), longitude.toFixed(2), filtersKey(filters), locale],
    queryFn: () =>
      api.getEvents(latitude, longitude, filters).then((data) =>
        // Decorate-sort-undecorate: compute each event's order once (it builds
        // luxon DateTimes) rather than O(n·log n) times inside the comparator.
        data
          .map((event) => ({ event, order: calculateOrder(event) }))
          .sort((a, b) => a.order - b.order)
          .map(({ event }) => event),
      ),
  })

  // "< NEARBY_KM" cap — only when a place was searched. Auto-applied when the
  // results include far in-person events; dismissable via the pill (then the far
  // ones show). Online events have no distance, so they are never distance-excluded.
  const hasFar =
    hasSearchCenter && events.some((e) => e.distance !== undefined && e.distance > NEARBY_KM)
  const nearbyActive = hasFar && !showAll
  const shown = nearbyActive
    ? events.filter((e) => e.distance === undefined || e.distance <= NEARBY_KM)
    : events

  return (
    <>
      <ActiveFilterPills
        nearby={nearbyActive && onShowAll ? { km: NEARBY_KM, onClear: onShowAll } : undefined}
      />
      {/* One free-line per list — cards carry no Free chips (issue #52). */}
      {shown.length > 0 && (
        <div className="px-6 pt-2 text-xs text-gray-11">{t('display.all_events_free')}</div>
      )}
      {shown.length === 0 ? (
        <EmptyResults nearbyKm={nearbyActive ? NEARBY_KM : undefined} />
      ) : (
        <EventsList events={shown} />
      )}
    </>
  )
}

// Shown when no events match. When the distance cap (not the filters) is what
// emptied the list, say so — the "< N km" pill above is how the user reveals the
// far events. Otherwise offer a "clear all filters" action when filters are the
// reason.
function EmptyResults({ nearbyKm }: { nearbyKm?: number }) {
  const { t } = useTranslation('common')
  const active = hasActiveFilters(useEventFilters())
  const { clearFilters } = useSetFilters()

  if (nearbyKm !== undefined) {
    return (
      <div className="p-4">
        <Alert color="default" description={t('filters.no_nearby', { km: nearbyKm })} />
      </div>
    )
  }

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
