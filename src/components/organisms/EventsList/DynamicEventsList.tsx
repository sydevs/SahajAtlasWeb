import type { BBox } from 'geojson'
import type { EventSlim } from '@/types'

import { type ReactNode, useCallback, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { EventsList } from './EventsList'
import { LoadMore } from './LoadMore'

import { Button } from '@/components/atoms/Button'
import { ActiveFilterPills } from '@/components/molecules/ActiveFilterPills'
import { FallbackPanel } from '@/components/molecules/Fallbacks'
import { FoldSection } from '@/components/molecules/FoldSection'
import { formatDistance } from '@/lib'
import { boundsOfPoints } from '@/lib/geo'
import {
  DEFAULT_REVEAL,
  hasActiveFilters,
  isoCountryCode,
  orderOnline,
  revealKey,
  revealRows,
  sortEvents,
  splitResults,
} from '@/lib/shape'
import { useCountrySite } from '@/hooks/use-country-site'
import { useEventFilters, useSetFilters } from '@/hooks/use-filters'
import { useFolds } from '@/hooks/use-folds'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { useReveal } from '@/hooks/use-reveal'
import { useSearchCountry } from '@/hooks/use-search-country'
import { useSortOrder } from '@/hooks/use-sort'
import { eventsQuery } from '@/config/api'

export interface DynamicEventsListProps {
  latitude: number
  longitude: number
  /**
   * Whether latitude and longitude came from a geocoded search, rather than
   * the map center. Without a searched place, there is no meaningful distance
   * cut, so the results form one undivided list.
   */
  hasSearchCenter?: boolean
  /** The searched place's own box, which decides what is "in" it. */
  bbox?: BBox
}

// A list too long to mount in one press shows this many rows first, and offers the rest.
const FOLD_PAGE = 25

export function DynamicEventsList({
  latitude,
  longitude,
  hasSearchCenter = false,
  bbox,
}: DynamicEventsListProps) {
  // These are the active, applied filters. getEvents applies the shared
  // `matchesFilters` predicate. The map filters its pins and clusters with the
  // same filters, so the list and the map agree. The key includes the
  // filters, so applying a new set triggers a refetch. Filters are edited in
  // the FilterView drawer, not here.
  const filters = useEventFilters()
  const { t } = useTranslation()
  const { locale, languageCode, regionNames } = useLocale()
  const { frameSearch } = useMapController()

  // This query uses the shared `eventsQuery` factory, so the SearchView story
  // seeds the exact key this reads (see config/api). The key holds the
  // quantized center, the filters, and the locale. It deliberately omits sort
  // and the reveal count. Both are presentation concerns, re-applied
  // client-side below. A count in the key would trigger a refetch on every
  // press.
  const query = eventsQuery(latitude, longitude, filters, locale)
  const { data: events } = useSuspenseQuery(query)

  // This applies the URL-selected ordering to the fetched list. It is memoized
  // on the fetched reference, the order and the language, so re-sorting is a cheap
  // client-side reorder, never a refetch. The query key above stays unchanged.
  // It takes the base subtag, never the resolved locale: an event's language is ISO 639-1 (#223).
  const order = useSortOrder()
  const sorted = useMemo(
    () => sortEvents(events, order, languageCode),
    [events, order, languageCode],
  )

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

  // The heading names the place the results are FOR, so unlike the card line above it can't follow
  // `?q` as someone types over it. It holds until the search lands somewhere new. The name can also
  // arrive just after the results do, when "find my location" resolves it, so an empty one fills in.
  const placeName = useRef({ at: '', name: '' })
  const at = `${longitude},${latitude}`

  if (placeName.current.at !== at || !placeName.current.name) {
    placeName.current = { at, name: searchedPlace }
  }

  // A searched place reads as groups, with `revealRows` still paging the first and last of them.
  // Without one, nothing is "here", so the list stays one undivided run.
  const sections = useMemo(
    () =>
      hasSearchCenter
        ? splitResults(sorted, { bbox, searchCountry, keepOrder: order === 'soonest' })
        : null,
    [sorted, bbox, searchCountry, order, hasSearchCenter],
  )
  const online = useMemo(
    () => (sections ? orderOnline(sections.online, order, languageCode) : []),
    [sections, order, languageCode],
  )
  const hereIds = useMemo(() => new Set(sections?.here.map((event) => event.id)), [sections])

  const { rows, more, next, total, nearbyKm } = useMemo(
    () =>
      sections
        ? revealRows([...sections.here, ...sections.distant], {
            shown,
            showAll,
            hasSearchCenter,
            near: (event) => hereIds.has(event.id),
          })
        : revealRows(sorted, { shown, showAll, hasSearchCenter, searchCountry }),
    [sorted, sections, hereIds, shown, showAll, hasSearchCenter, searchCountry],
  )

  const folds = useFolds(revealKey(query.queryKey, ''))
  const openNearby = folds.isOpen('nearby', sections?.here.length === 0)
  const openOnline = folds.isOpen(
    'online',
    sections?.here.length === 0 && sections?.nearby.length === 0,
  )

  // Opening "Other cities" widens the map to show them, and closing it comes back to the place.
  const toggleNearby = (open: boolean) => {
    folds.setOpen('nearby', open)
    const points = (sections?.nearby ?? []).flatMap(({ address }) =>
      address?.longitude != null && address.latitude != null
        ? [[address.longitude, address.latitude]]
        : [],
    )
    const corners = bbox
      ? [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ]
      : [[longitude, latitude]]
    const wide = open ? boundsOfPoints([...points, ...corners]) : null

    frameSearch({
      bbox: (wide ?? bbox) as [number, number, number, number] | undefined,
      center: [longitude, latitude],
    })
  }

  // A row in a group read by place leads with the town, and the country only when it isn't the one
  // searched. It leaves out the kilometres on a whole-country search, where they'd count from the
  // middle of the country. These go to a memoized card as plain strings, so a reveal doesn't
  // re-render the rows above it.
  const placeLineFor = useCallback(
    (event: EventSlim) => {
      const city = event.address?.city?.trim()

      if (!city) return undefined
      const country = isoCountryCode(event.address?.country)
      const name =
        searchCountry && country && country !== searchCountry
          ? `${city}, ${regionNames.of(country) ?? country}`
          : city

      return sections?.size === 'area' || event.distance === undefined
        ? name
        : `${name} · ${formatDistance(event.distance, locale)}`
    },
    [searchCountry, regionNames, locale, sections?.size],
  )

  // Whether a reveal has happened — kept beside the count for the same reason, so
  // returning from an event doesn't drop the footer's running total while the list is
  // still showing 60 rows. `showAll` alone covers the all-distant first press, whose
  // count stays at one page.
  const revealed = shown > DEFAULT_REVEAL || showAll

  const listRef = useRef<HTMLDivElement>(null)
  const distantRef = useRef<HTMLDivElement>(null)
  // The index of the first row a press reveals, parked for the effect below. A ref, not
  // state: it's written in an event handler and read once after the resulting commit,
  // so it must never itself cause a render.
  const focusFrom = useRef<{ index: number; from: typeof more } | null>(null)

  const reveal = (trigger: 'press' | 'auto') => {
    // `pending` guards a double reveal: the previous page is still rendering, so the
    // rows this would count from are already stale. This matters most for the
    // observer, which can fire again before the transition commits.
    if (!next || pending) return
    // Only a press parks a focus target. An auto-reveal is a scroll, not an
    // interaction: moving focus there would remove focus from whatever the
    // reader was on.
    if (trigger === 'press') focusFrom.current = { index: rows.length, from: more }
    revealMore(next)
  }

  // This keeps focus somewhere sensible after a reveal. While the button
  // survives a press, it keeps focus for free: it is the same DOM node, and
  // only its label changes. The one case to handle is the LAST press. That
  // press unmounts the button, and would otherwise drop focus to the
  // document body. So focus instead goes to the first newly revealed card.
  useEffect(() => {
    const press = focusFrom.current

    if (press === null) return
    focusFrom.current = null
    // With groups, the two buttons sit in different places, so moving from "more" to "farther"
    // loses the pressed one too. In one undivided list it stays and only changes its label.
    if (more !== null && (!sections || more === press.from)) return

    const hereCount = sections ? Math.min(sections.here.length, rows.length) : rows.length
    const [list, index] =
      press.index < hereCount
        ? [listRef.current, press.index]
        : [distantRef.current, press.index - hereCount]

    // `preventScroll` applies because the newly revealed rows open exactly
    // where the button was, already in view. If the browser also scrolled to
    // the focused card, it would move the list unexpectedly under a mouse
    // user who only pressed a button.
    list?.querySelectorAll<HTMLElement>('[data-event-row]')[index]?.focus({ preventScroll: true })
  }, [rows.length, more, sections])

  if (sections) {
    const { here, nearby, distant, size } = sections
    const hereRows = rows.filter((event) => hereIds.has(event.id))
    const distantRows = rows.filter((event) => !hereIds.has(event.id))
    const place = placeName.current.name
    const nothing = here.length + nearby.length + online.length + distant.length === 0
    const hideDistance = size === 'area'
    const hereTitle = !place
      ? t('search.sections.results')
      : size === 'area'
        ? place
        : t(size === 'spot' ? 'search.sections.near' : 'search.sections.here', { place })
    // On a country search, "cities" is the wrong word for what lies just outside it. A class whose
    // country doesn't resolve can't be in the searched one, since it would have counted as here.
    const nearbyTitle =
      size !== 'area'
        ? t('search.sections.nearby')
        : nearby.every((event) => isoCountryCode(event.address?.country) !== searchCountry)
          ? t('search.sections.across_border')
          : t('search.sections.nearby_places')

    return (
      <>
        <ActiveFilterPills />
        {nothing && <EmptyResults nearbyKm={more === 'farther' ? nearbyKm : undefined} />}
        {here.length > 0 && (
          <section ref={listRef}>
            <ResultsHeading count={here.length}>{hereTitle}</ResultsHeading>
            {/* The map went wide when this group opened, while this heading still names the place.
                On a lowered phone sheet this is the one line that says why the two differ. */}
            {openNearby && size !== 'area' && (
              <p className="px-4 pb-1 text-sm text-gray-11">{t('search.sections.map_wider')}</p>
            )}
            <EventsList
              events={hereRows}
              fromCentre={size === 'town'}
              hideDistance={hideDistance}
              searchedPlace={searchedPlace}
            />
            {more === 'more' && (
              <LoadMore
                auto
                announce={false}
                loading={pending}
                more="more"
                shown={rows.length}
                total={total}
                onReveal={reveal}
              />
            )}
          </section>
        )}
        {nearby.length > 0 && (
          <FoldSection
            count={nearby.length}
            open={openNearby}
            title={nearbyTitle}
            onOpenChange={toggleNearby}
          >
            <FoldRows folds={folds} id="nearby" placeLineFor={placeLineFor} rows={nearby} />
          </FoldSection>
        )}
        {online.length > 0 && (
          <FoldSection
            count={online.length}
            open={openOnline}
            title={t('search.sections.online')}
            onOpenChange={(open) => folds.setOpen('online', open)}
          >
            <FoldRows folds={folds} id="online" rows={online} />
          </FoldSection>
        )}
        {distantRows.length > 0 && (
          <section ref={distantRef} className="border-t border-divider">
            <ResultsHeading count={distant.length}>{t('search.sections.farther')}</ResultsHeading>
            <EventsList events={distantRows} placeLineFor={placeLineFor} />
          </section>
        )}
        {(more === 'farther' || revealed) && (
          <LoadMore
            announce={revealed}
            loading={pending}
            more={more === 'farther' ? more : null}
            shown={rows.length}
            total={total}
            onReveal={reveal}
          />
        )}
      </>
    )
  }

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

// A group's title that doesn't fold. It reads as the title of the list, since on this view the
// header above it is a search field.
function ResultsHeading({ children, count }: { children: ReactNode; count: number }) {
  return (
    <h3 className="flex items-baseline gap-2 px-4 pt-3 pb-1 text-xl">
      <span className="min-w-0">{children}</span>
      <span className="text-sm font-normal text-gray-11 tabular-nums">{count}</span>
    </h3>
  )
}

// The rows of a folded group. A long group shows one page first, because a press has to mount
// every row it opens, and that is the part of this list that costs (see `MAX_REVEAL`).
function FoldRows({
  id,
  rows,
  folds,
  placeLineFor,
}: {
  id: string
  rows: EventSlim[]
  folds: ReturnType<typeof useFolds>
  placeLineFor?: (event: EventSlim) => string | undefined
}) {
  const { t } = useTranslation()
  const all = folds.isOpen(`${id}:all`, false)

  return (
    <>
      <EventsList events={all ? rows : rows.slice(0, FOLD_PAGE)} placeLineFor={placeLineFor} />
      {!all && rows.length > FOLD_PAGE && (
        <div className="flex justify-center px-4 pt-2 pb-4">
          <Button
            color="neutral"
            size="sm"
            variant="flat"
            onClick={() => folds.setOpen(`${id}:all`, true)}
          >
            {t('search.sections.show_all', { total: rows.length })}
          </Button>
        </div>
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
