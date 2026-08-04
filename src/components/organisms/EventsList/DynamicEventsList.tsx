import type { SortOrder } from '@/lib/shape'

import { useEffect, useMemo, useRef } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { DateTime } from 'luxon'
import { useTranslation } from 'react-i18next'

import { EventsList } from './EventsList'
import { LoadMore } from './LoadMore'

import { ActiveFilterPills } from '@/components/molecules/ActiveFilterPills'
import { CountrySiteOffer } from '@/components/molecules/CountrySiteOffer'
import { Alert } from '@/components/atoms/Alert'
import { isSoon } from '@/lib'
import { EventSlim } from '@/types'
import {
  DEFAULT_REVEAL,
  NEARBY_KM,
  byDistance,
  byNextOccurrence,
  hasActiveFilters,
  isOnline,
  nextOccurrence,
  revealRows,
} from '@/lib/shape'
import { useCountrySite } from '@/hooks/use-country-site'
import { useEventFilters, useSetFilters } from '@/hooks/use-filters'
import { useLocale } from '@/hooks/use-locale'
import { useReveal } from '@/hooks/use-reveal'
import { useSortOrder } from '@/hooks/use-sort'
import { eventsQuery } from '@/config/api'
import i18n from '@/config/i18n'

export interface DynamicEventsListProps {
  latitude: number
  longitude: number
  /**
   * Whether latitude/longitude came from a geocoded search (vs the map centre).
   * Without a searched place there's no meaningful distance cut, so the results are
   * one undivided list.
   */
  hasSearchCenter?: boolean
}

function calculateOrder(event: EventSlim, language: string | undefined) {
  let order = event.distance ?? 100
  const online = isOnline(event)
  const languageCode = event.languages[0] ?? ''
  const next = nextOccurrence(event)

  if (language != languageCode) order *= 2
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
//
// It sorts the WHOLE matching set. That's the point of dropping the fetcher's
// nearest-50 cap (#85): sorting a pre-truncated pool made `?sort=soonest` mean
// "soonest among the 50 nearest" and re-ranked `recommended` over an arbitrary subset.
// Order of operations is filter → sort → segment → slice; `revealRows` owns the last two.
function sortEvents(events: EventSlim[], order: SortOrder): EventSlim[] {
  switch (order) {
    case 'closest':
      return [...events].sort(byDistance)
    case 'soonest':
      return [...events].sort(byNextOccurrence)
    default: {
      // Read once rather than per event: this now walks the whole matching set, not a
      // capped 50, so anything hoistable out of the decorate loop is worth hoisting.
      const language = i18n.resolvedLanguage

      return events
        .map((event) => ({ event, order: calculateOrder(event, language) }))
        .sort((a, b) => a.order - b.order)
        .map(({ event }) => event)
    }
  }
}

export function DynamicEventsList({
  latitude,
  longitude,
  hasSearchCenter = false,
}: DynamicEventsListProps) {
  // The active (applied) filters. getEvents applies the shared `matchesFilters`
  // predicate; the map filters its pins/clusters with the same filters, so the
  // list and the map agree. The key includes the filters, so applying a new set
  // refetches (filters are edited in the FilterView drawer, not here).
  const filters = useEventFilters()
  const { locale } = useLocale()

  // Through the shared `eventsQuery` factory so the SearchView story seeds the exact
  // key this reads (see config/api) — the quantized centre, the filters, and the
  // locale, with sort and the reveal count deliberately absent (both are presentation,
  // re-applied client-side below; a count in the key would refetch on every press).
  const { data: events } = useSuspenseQuery(eventsQuery(latitude, longitude, filters, locale))

  // Apply the URL-selected ordering to the fetched list. Memoized on the fetched
  // reference + the order, so re-sorting is a cheap client-side reorder, never a
  // refetch (the query key above is unchanged).
  const order = useSortOrder()
  const sorted = useMemo(() => sortEvents(events, order), [events, order])

  // How much of that is revealed — URL-driven (`?shown=`/`?all=1`), so it survives the
  // drawer stack's remount-on-navigation and a deep link restores it. `revealRows`
  // splits the sorted set at the "< NEARBY_KM" boundary and slices to the revealed
  // count; nothing here refetches, because every match is already in memory.
  const { shown, showAll, revealMore } = useReveal()
  const { rows, more, next, total } = useMemo(
    () => revealRows(sorted, { shown, showAll, hasSearchCenter }),
    [sorted, shown, showAll, hasSearchCenter],
  )

  // Whether a reveal has happened, read off the URL rather than held as state — for the
  // same reason the count itself is: component state would reset on the drawer stack's
  // remount, so returning from an event would drop the footer's running total while the
  // URL still said 60 rows were shown. Either param moving off its default means a press
  // happened (`?all=1` alone covers the all-far first press, whose count stays at one page).
  const revealed = shown > DEFAULT_REVEAL || showAll

  const listRef = useRef<HTMLDivElement>(null)
  // The index of the first row a press reveals, parked for the effect below. A ref, not
  // state: it's written in an event handler and read once after the resulting commit,
  // so it must never itself cause a render.
  const focusFrom = useRef<number | null>(null)

  const reveal = () => {
    if (!next) return
    focusFrom.current = rows.length
    revealMore(next)
  }

  // Keep focus somewhere sensible after a reveal. While the button survives the press
  // it keeps focus for free (same DOM node — only its label can change), so the only
  // case to handle is the LAST press, which unmounts it and would otherwise drop focus
  // to the document body. Then focus goes to the first newly revealed card.
  useEffect(() => {
    const index = focusFrom.current

    if (index === null) return
    focusFrom.current = null
    if (more !== null) return

    listRef.current?.querySelectorAll<HTMLElement>('[data-event-row]')[index]?.focus()
  }, [rows.length, more])

  return (
    <>
      <ActiveFilterPills />
      <div ref={listRef}>
        {rows.length === 0 ? (
          <EmptyResults nearbyKm={more === 'farther' ? NEARBY_KM : undefined} />
        ) : (
          <EventsList events={rows} />
        )}
      </div>
      {/* Nothing left to offer and nothing announced yet — but once a reveal HAS
          happened the footer stays mounted, so the final press's announcement isn't
          unmounted in the same commit as the button that triggered it. */}
      {(more !== null || revealed) && (
        <LoadMore
          announce={revealed}
          km={NEARBY_KM}
          more={more}
          shown={rows.length}
          total={total}
          onReveal={reveal}
        />
      )}
    </>
  )
}

// Shown when no events match, in the order the reasons actually explain the empty
// list:
//
//  1. The searched country lists NO programs at all — offer its own national site
//     (issue #82). Ahead of the distance boundary below because `getEvents` returns
//     every match ranked by distance with no limit, so a program-less country's
//     nearest results are usually a thousand km away: the "no events within N km"
//     branch would fire for virtually every such search and bury the one useful next
//     step. `useCountrySite` answers from the FULL feed, and stands down while any
//     filter is active — an empty list under filters is explained by the filters, and
//     case 3 owns the "clear all" escape hatch, so the offer waits rather than
//     replacing it.
//  2. Every match lies beyond the distance boundary — say so; the "show events farther
//     than N km" control below the list is how the user reaches them.
//  3. Otherwise: "no results" with a "clear all filters" action when filters are the
//     reason, else the plain "no events" line.
//
// The country-site offer does NOT suppress the "show events farther" control below the
// list — the offer keeps the top of the empty state, and a second way out sitting under
// it doesn't bury it. That also keeps `useCountrySite` (which scans the whole feed and
// rebuilds a region index) off the path a NON-empty list renders on.
function EmptyResults({ nearbyKm }: { nearbyKm?: number }) {
  const { t } = useTranslation('common')
  const active = hasActiveFilters(useEventFilters())
  const { clearFilters } = useSetFilters()
  const countrySite = useCountrySite()

  if (countrySite) {
    return (
      <div className="p-4">
        <CountrySiteOffer {...countrySite} />
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
