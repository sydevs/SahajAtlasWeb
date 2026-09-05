import type { SortOrder } from '@/lib/shape'

import { useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { DateTime } from 'luxon'

import { EventsList } from './EventsList'
import { LoadMore } from './LoadMore'

import { ActiveFilterPills } from '@/components/molecules/ActiveFilterPills'
import { FallbackPanel } from '@/components/molecules/Fallbacks'
import { isSoon } from '@/lib'
import { EventSlim } from '@/types'
import {
  DEFAULT_REVEAL,
  byDistance,
  byNextOccurrence,
  hasActiveFilters,
  isOnline,
  nextOccurrence,
  revealKey,
  revealRows,
} from '@/lib/shape'
import { useCountrySite } from '@/hooks/use-country-site'
import { useEventFilters, useSetFilters } from '@/hooks/use-filters'
import { useLocale } from '@/hooks/use-locale'
import { useReveal } from '@/hooks/use-reveal'
import { useSearchCountry } from '@/hooks/use-search-country'
import { useSortOrder } from '@/hooks/use-sort'
import { eventsQuery } from '@/config/api'
import i18n from '@/config/i18n'

export interface DynamicEventsListProps {
  latitude: number
  longitude: number
  /**
   * Whether latitude and longitude came from a geocoded search, rather than
   * the map center. Without a searched place, there is no meaningful distance
   * cut, so the results form one undivided list.
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

// This reorders the fetched events for the chosen sort. Sorting is a
// presentation concern: it runs on the already-fetched list, so switching
// sort never triggers a refetch. Recommended keeps the relevance score. It
// uses decorate-sort-undecorate, so each event's order is computed once (it
// builds luxon DateTimes) instead of O(n·log n) times inside the comparator.
// Closest and Soonest reuse the shared `@/lib/shape` comparators: distance
// ascending, or next occurrence, with placeless and undated events last.
//
// This sorts the WHOLE matching set. That is the point of dropping the
// fetcher's nearest-50 cap (#85). Sorting a pre-truncated pool made
// `?sort=soonest` mean "soonest among the 50 nearest," and it re-ranked
// `recommended` over an arbitrary subset. The order of operations is filter,
// then sort, then segment, then slice. `revealRows` owns the last two steps.
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
  // These are the active, applied filters. getEvents applies the shared
  // `matchesFilters` predicate. The map filters its pins and clusters with the
  // same filters, so the list and the map agree. The key includes the
  // filters, so applying a new set triggers a refetch. Filters are edited in
  // the FilterView drawer, not here.
  const filters = useEventFilters()
  const { locale } = useLocale()

  // This query uses the shared `eventsQuery` factory, so the SearchView story
  // seeds the exact key this reads (see config/api). The key holds the
  // quantized center, the filters, and the locale. It deliberately omits sort
  // and the reveal count. Both are presentation concerns, re-applied
  // client-side below. A count in the key would trigger a refetch on every
  // press.
  const query = eventsQuery(latitude, longitude, filters, locale)
  const { data: events } = useSuspenseQuery(query)

  // This applies the URL-selected ordering to the fetched list. It is memoized
  // on the fetched reference and the order, so re-sorting is a cheap
  // client-side reorder, never a refetch. The query key above stays unchanged.
  const order = useSortOrder()
  const sorted = useMemo(() => sortEvents(events, order), [events, order])

  // This tracks how much of the list is revealed. It is session state, keyed
  // by the result set, so it survives the drawer stack's remount-on-navigation:
  // opening an event and coming back keeps your place. It resets on a reload
  // and whenever the key changes — a new place, an edited filter, a re-sort,
  // or a language switch. `revealRows` splits the sorted set at the distance
  // boundary (tightened for events across a border from the searched
  // country), then slices to the count. Nothing here refetches. Every match
  // stays in memory. The key comes from the events query key itself, plus the
  // sort, which that key omits. This way, the reveal's notion of "the same
  // search" cannot drift from the fetch's. The center quantization lives in
  // one place.
  const searchCountry = useSearchCountry()
  const { shown, showAll, pending, revealMore } = useReveal(revealKey(query.queryKey, order))

  // This is the searched place each card names in its distance line, read
  // ONCE here. `?q` is rewritten on every geocoder keystroke, so a card that
  // reads it directly subscribes the whole list to that churn — see the
  // prop's note on `EventsList`. Its leading part keeps the line short. The
  // precise reference point stays in each card's accessible label.
  const searchedPlace = (useSearchParams()[0].get('q') ?? '').split(',')[0].trim()
  const { rows, more, next, total, nearbyKm } = useMemo(
    () => revealRows(sorted, { shown, showAll, hasSearchCenter, searchCountry }),
    [sorted, shown, showAll, hasSearchCenter, searchCountry],
  )

  // Whether a reveal has happened — kept beside the count for the same reason, so
  // returning from an event doesn't drop the footer's running total while the list is
  // still showing 60 rows. `showAll` alone covers the all-distant first press, whose
  // count stays at one page.
  const revealed = shown > DEFAULT_REVEAL || showAll

  const listRef = useRef<HTMLDivElement>(null)
  // The index of the first row a press reveals, parked for the effect below. A ref, not
  // state: it's written in an event handler and read once after the resulting commit,
  // so it must never itself cause a render.
  const focusFrom = useRef<number | null>(null)

  const reveal = (trigger: 'press' | 'auto') => {
    // `pending` guards a double reveal: the previous page is still rendering, so the
    // rows this would count from are already stale. This matters most for the
    // observer, which can fire again before the transition commits.
    if (!next || pending) return
    // Only a press parks a focus target. An auto-reveal is a scroll, not an
    // interaction: moving focus there would remove focus from whatever the
    // reader was on.
    if (trigger === 'press') focusFrom.current = rows.length
    revealMore(next)
  }

  // This keeps focus somewhere sensible after a reveal. While the button
  // survives a press, it keeps focus for free: it is the same DOM node, and
  // only its label changes. The one case to handle is the LAST press. That
  // press unmounts the button, and would otherwise drop focus to the
  // document body. So focus instead goes to the first newly revealed card.
  useEffect(() => {
    const index = focusFrom.current

    if (index === null) return
    focusFrom.current = null
    if (more !== null) return

    // `preventScroll` applies because the newly revealed rows open exactly
    // where the button was, already in view. If the browser also scrolled to
    // the focused card, it would move the list unexpectedly under a mouse
    // user who only pressed a button.
    listRef.current
      ?.querySelectorAll<HTMLElement>('[data-event-row]')
      [index]?.focus({ preventScroll: true })
  }, [rows.length, more])

  return (
    <>
      <ActiveFilterPills />
      <div ref={listRef}>
        {rows.length === 0 ? (
          <EmptyResults nearbyKm={more === 'farther' ? nearbyKm : undefined} />
        ) : (
          <EventsList events={rows} searchedPlace={searchedPlace} />
        )}
      </div>
      {/* At this point, nothing is left to offer and nothing has announced yet.
          But once a reveal HAS happened, the footer stays mounted. This way,
          the final press's announcement is not unmounted in the same commit
          as the button that triggered it. */}
      {(more !== null || revealed) && (
        <LoadMore
          announce={revealed}
          // This pages automatically as the reader reaches the foot of the list,
          // but ONLY within the segment on screen. Crossing into the distant
          // events is a decision ("Show distant events"), so it never happens
          // on a scroll. Once those events ARE showing, paging goes back to
          // being explicit, because from there the list runs to the other
          // side of the world.
          auto={more === 'more' && !showAll}
          loading={pending}
          more={more}
          shown={rows.length}
          total={total}
          onReveal={reveal}
        />
      )}
    </>
  )
}

// This renders when no events match. The three branches below appear in the
// order that best explains the empty list. Every branch uses the same
// `FallbackPanel` that a dead link and a broken query also render — one
// component reading one policy table (issue #89). So this function only
// decides WHICH row to show:
//
//  1. The searched country lists NO programs at all. This row offers that
//     country's own national site (issue #82). It comes before the
//     distance-boundary row below, because `getEvents` returns every match
//     ranked by distance with no limit. So a program-less country's nearest
//     results usually sit a thousand km away, and the "no events within N km"
//     branch would fire for almost every such search, burying the one useful
//     next step. `useCountrySite` answers from the FULL feed. It stands down
//     while any filter is active, because an empty list under a filter is
//     explained by the filter — case 3 owns the "clear all" escape hatch
//     there. So this offer waits, rather than replacing that one.
//  2. Every match lies beyond the distance boundary. This row says so. The
//     "show events farther than N km" control below the list is how the user
//     reaches them. This is the one row that offers nothing else, because
//     that control is already the way out.
//  3. Otherwise, this row shows "no results" with a "clear all filters"
//     action, when filters are the reason. Else it shows the plain "no
//     events" line, with the onward offer behind it.
//
// The country-site offer does NOT suppress the "show events farther" control
// below the list. The offer keeps the top of the empty state, and a second
// way out below it does not bury the first. This also keeps `useCountrySite`
// off the path a NON-empty list renders on — that hook scans the whole feed
// and rebuilds a region index.
//
// `hasSearchChrome` appears throughout, because SearchView's header already
// IS a geocoder. A second one under the sentence would look odd on the screen.
function EmptyResults({ nearbyKm }: { nearbyKm?: number }) {
  const { regionNames } = useLocale()
  const active = hasActiveFilters(useEventFilters())
  const { clearFilters } = useSetFilters()
  const countrySite = useCountrySite()

  if (countrySite) {
    // `countryCode` is always canonical uppercase alpha-2 (`isoCountryCode`), so `of`
    // resolves or returns the code — it can't throw here.
    const country = regionNames.of(countrySite.countryCode) ?? countrySite.countryCode

    return (
      <FallbackPanel
        hasSearchChrome
        align="start"
        kind="country-site"
        offer={{
          kind: 'country-site',
          path: countrySite.href,
          name: country,
          countryCode: countrySite.countryCode,
        }}
        values={{ country }}
      />
    )
  }

  if (nearbyKm !== undefined) {
    return (
      <FallbackPanel hasSearchChrome align="start" kind="no-nearby" values={{ km: nearbyKm }} />
    )
  }

  // Filters are both the explanation and the escape. So that row keeps "Clear
  // all" and nothing else. An onward link would compete with the one action
  // that actually restores results.
  return (
    <FallbackPanel
      hasSearchChrome
      align="start"
      kind={active ? 'no-results' : 'empty'}
      onClearFilters={active ? clearFilters : undefined}
    />
  )
}
