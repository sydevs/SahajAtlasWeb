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
  const query = eventsQuery(latitude, longitude, filters, locale)
  const { data: events } = useSuspenseQuery(query)

  // Apply the URL-selected ordering to the fetched list. Memoized on the fetched
  // reference + the order, so re-sorting is a cheap client-side reorder, never a
  // refetch (the query key above is unchanged).
  const order = useSortOrder()
  const sorted = useMemo(() => sortEvents(events, order), [events, order])

  // How much of that is revealed — session state keyed by the result set, so it
  // survives the drawer stack's remount-on-navigation (opening an event and coming back
  // keeps your place) but resets on a reload and whenever the key changes: a new place,
  // an edited filter, a re-sort, a language switch. `revealRows` splits the sorted set
  // at the distance boundary (tightened for events across a border from the searched
  // country) and slices to the count; nothing here refetches, every match is in memory.
  // Keyed off the events query key itself (plus the sort, which that key omits), so the
  // reveal's notion of "the same search" can't drift from the fetch's — the centre
  // quantization lives in one place.
  const searchCountry = useSearchCountry()
  const { shown, showAll, pending, revealMore } = useReveal(revealKey(query.queryKey, order))

  // The searched place each card names in its distance line, read ONCE here. `?q` is
  // rewritten on every geocoder keystroke, so a card reading it subscribes the whole
  // list to that churn — see the prop's note on `EventsList`. Its leading part keeps
  // the line short; the precise reference point stays in each card's accessible label.
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
    // rows this would count from are already stale. Matters most for the observer,
    // which can fire again before the transition commits.
    if (!next || pending) return
    // Only a press parks a focus target. An auto-reveal is a scroll, not an
    // interaction: moving focus there would yank it off whatever the reader was on.
    if (trigger === 'press') focusFrom.current = rows.length
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

    // `preventScroll` because the newly revealed rows open exactly where the button
    // was — already in view. Letting the browser scroll to the focused card on top of
    // that yanks the list out from under a mouse user who only pressed a button.
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
      {/* Nothing left to offer and nothing announced yet — but once a reveal HAS
          happened the footer stays mounted, so the final press's announcement isn't
          unmounted in the same commit as the button that triggered it. */}
      {(more !== null || revealed) && (
        <LoadMore
          announce={revealed}
          // Page automatically as the reader reaches the foot of the list — but ONLY
          // within the segment on screen. Crossing into the distant events is a
          // decision ("Show distant events"), so it never happens on a scroll; and
          // once they ARE showing, paging goes back to being explicit, because from
          // there the list runs to the other side of the world.
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

// Shown when no events match, in the order the reasons actually explain the empty list.
// Every branch is the same `FallbackPanel` a dead link and a broken query render — one
// component reading one policy table (issue #89) — so all this decides is WHICH row:
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
//     than N km" control below the list is how the user reaches them. The one row that
//     offers nothing, because that control already is the way out.
//  3. Otherwise: "no results" with a "clear all filters" action when filters are the
//     reason, else the plain "no events" line with the onward offer behind it.
//
// The country-site offer does NOT suppress the "show events farther" control below the
// list — the offer keeps the top of the empty state, and a second way out sitting under
// it doesn't bury it. That also keeps `useCountrySite` (which scans the whole feed and
// rebuilds a region index) off the path a NON-empty list renders on.
//
// `hasSearchChrome` throughout: SearchView's header already IS a geocoder, and a second
// one under the sentence would be the odd thing on the screen.
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
        message={{ values: { country } }}
        offer={{
          kind: 'country-site',
          path: countrySite.href,
          name: country,
          countryCode: countrySite.countryCode,
        }}
      />
    )
  }

  if (nearbyKm !== undefined) {
    return (
      <FallbackPanel
        hasSearchChrome
        align="start"
        kind="no-nearby"
        message={{ values: { km: nearbyKm } }}
      />
    )
  }

  // Filters are the explanation AND the escape, so that row keeps "Clear all" and nothing
  // else — an onward link would compete with the one action that actually restores results.
  return (
    <FallbackPanel
      hasSearchChrome
      align="start"
      kind={active ? 'no-results' : 'empty'}
      onClearFilters={active ? clearFilters : undefined}
    />
  )
}
