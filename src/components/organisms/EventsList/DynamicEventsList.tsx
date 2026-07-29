import type { SortOrder } from '@/lib/shape'

import { useMemo } from 'react'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { DateTime } from 'luxon'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'

import { EventsList } from './EventsList'

import { ActiveFilterPills } from '@/components/molecules/ActiveFilterPills'
import { CountrySiteOffer } from '@/components/molecules/CountrySiteOffer'
import { Alert } from '@/components/atoms/Alert'
import { COUNTRY_SITES } from '@/data/country-sites'
import { isSoon } from '@/lib'
import { isoCountryCode } from '@/lib/geocode'
import { EventSlim } from '@/types'
import {
  byDistance,
  byNextOccurrence,
  countryHasPrograms,
  filtersKey,
  hasActiveFilters,
  isOnline,
  nextOccurrence,
} from '@/lib/shape'
import { useEventFilters, useSetFilters } from '@/hooks/use-filters'
import { useLocale } from '@/hooks/use-locale'
import { useSortOrder } from '@/hooks/use-sort'
import api, { regionsQuery } from '@/config/api'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
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

// Reorder the fetched events for the chosen sort (a presentation concern — this runs
// on the already-fetched list, so switching sort never refetches). Recommended keeps
// the relevance score, decorate-sort-undecorate so each event's order is computed once
// (it builds luxon DateTimes) rather than O(n·log n) times inside the comparator;
// Closest and Soonest reuse the shared `@/lib/shape` comparators (distance ascending /
// next-occurrence, placeless + undated last).
function sortEvents(events: EventSlim[], order: SortOrder): EventSlim[] {
  switch (order) {
    case 'closest':
      return [...events].sort(byDistance)
    case 'soonest':
      return [...events].sort(byNextOccurrence)
    default:
      return events
        .map((event) => ({ event, order: calculateOrder(event) }))
        .sort((a, b) => a.order - b.order)
        .map(({ event }) => event)
  }
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

  const { data: events } = useSuspenseQuery({
    // Latitude/longitude are rounded to reduce re-fetching when the map moves; the
    // locale keys the (localized) titles the list shows, so a switch refetches. Sort
    // is deliberately NOT in the key — it's presentation, applied below in a memo.
    queryKey: ['events', latitude.toFixed(2), longitude.toFixed(2), filtersKey(filters), locale],
    queryFn: () => api.getEvents(latitude, longitude, filters),
  })

  // Apply the URL-selected ordering to the fetched list. Memoized on the fetched
  // reference + the order, so re-sorting is a cheap client-side reorder, never a
  // refetch (the query key above is unchanged).
  const order = useSortOrder()
  const sorted = useMemo(() => sortEvents(events, order), [events, order])

  // "< NEARBY_KM" cap — only when a place was searched. Auto-applied when the
  // results include far in-person events; dismissable via the pill (then the far
  // ones show). Online events have no distance, so they are never distance-excluded.
  const hasFar =
    hasSearchCenter && sorted.some((e) => e.distance !== undefined && e.distance > NEARBY_KM)
  const nearbyActive = hasFar && !showAll
  const shown = nearbyActive
    ? sorted.filter((e) => e.distance === undefined || e.distance <= NEARBY_KM)
    : sorted

  return (
    <>
      <ActiveFilterPills
        nearby={nearbyActive && onShowAll ? { km: NEARBY_KM, onClear: onShowAll } : undefined}
      />
      {shown.length === 0 ? (
        <EmptyResults nearbyKm={nearbyActive ? NEARBY_KM : undefined} />
      ) : (
        <EventsList events={shown} />
      )}
    </>
  )
}

// Shown when no events match, in the order the reasons actually explain the empty
// list:
//
//  1. The searched country lists NO programs at all — offer its own national site
//     (issue #82). First because it's the only filter- and distance-independent
//     reason: `getEvents` returns the nearest matches with no distance cap, so a
//     program-less country's nearest results are usually a thousand km away, which
//     would light the "< N km" cap below and bury the one useful next step. That the
//     country is empty is a fact about the feed, not about the current filters — so
//     it's answered from the FULL feed (`countryHasPrograms`), and it holds whether or
//     not filters are applied (the pills above still offer to clear them).
//  2. The distance cap (not the filters) emptied the list — say so; the "< N km"
//     pill above is how the user reveals the far events.
//  3. Otherwise: "no results" with a "clear all filters" action when filters are the
//     reason, else the plain "no events" line.
function EmptyResults({ nearbyKm }: { nearbyKm?: number }) {
  const { t } = useTranslation('common')
  const active = hasActiveFilters(useEventFilters())
  const { clearFilters } = useSetFilters()
  const [searchParams] = useSearchParams()

  // `?cc` is written by the search field / accepted geolocation suggestion, so this
  // only ever resolves on /search — no other list surface changes behaviour.
  const countryCode = isoCountryCode(searchParams.get('cc'))
  const site = countryCode ? COUNTRY_SITES[countryCode] : undefined

  // Both are cache-once reads warmed at bootstrap (`api.warmCaches`); until they
  // land, `countryHasPrograms` answers false-y and the offer simply doesn't show.
  const { data: regions } = useQuery({ ...regionsQuery(), enabled: site !== undefined })
  const { data: geojson } = useQuery({
    queryKey: ['geojson'],
    queryFn: () => api.getGeojson(),
    staleTime: GEOJSON_STALE_TIME,
    enabled: site !== undefined,
  })

  if (
    countryCode &&
    site &&
    geojson &&
    !countryHasPrograms(regions, geojson.features, countryCode)
  ) {
    return (
      <div className="p-4">
        <CountrySiteOffer countryCode={countryCode} href={site} />
      </div>
    )
  }

  if (nearbyKm !== undefined) {
    return (
      <div className="p-4">
        <Alert color="neutral" description={t('filters.no_nearby', { km: nearbyKm })} />
      </div>
    )
  }

  return (
    <div className="p-4">
      <Alert
        color="neutral"
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
