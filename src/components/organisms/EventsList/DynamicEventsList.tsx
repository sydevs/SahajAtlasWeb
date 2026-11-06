import type { BBox } from 'geojson'
import type { EventSlim } from '@/types'

import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { useQueries, useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { EventsList } from './EventsList'
import { LoadMore } from './LoadMore'

import { Button } from '@/components/atoms/Button'
import { type FilterPill, useFilterPills } from '@/components/molecules/ActiveFilterPills'
import { AddClassEntry } from '@/components/molecules/AddClassEntry'
import { FallbackPanel } from '@/components/molecules/Fallbacks'
import { ResultCountStatus } from '@/components/molecules/ResultCountStatus'
import { FoldSection } from '@/components/molecules/FoldSection'
import { formatDistance } from '@/lib'
import { regionalLocale } from '@/lib/time'
import {
  DEFAULT_FILTERS,
  DEFAULT_REVEAL,
  EXCLUDE_EVENT_PARAM,
  addClassPath,
  boundsWith,
  filtersKey,
  hasActiveFilters,
  isoCountryCode,
  orderOnline,
  revealKey,
  revealRows,
  sortEvents,
  searchFrame,
  splitResults,
  withoutFilter,
} from '@/lib/shape'
import { useCountrySite } from '@/hooks/use-country-site'
import { useEventFilters, useSetFilters } from '@/hooks/use-filters'
import { useFolds } from '@/hooks/use-folds'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { usePlaceScope } from '@/hooks/use-place-scope'
import { useReveal } from '@/hooks/use-reveal'
import { useSortOrder } from '@/hooks/use-sort'
import { eventsQuery } from '@/config/api'
import { useArrivalFilters } from '@/config/store'
import { rewordedKey } from '@/config/reworded-keys'

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
  const excludedId = Number(useSearchParams()[0].get(EXCLUDE_EVENT_PARAM))
  const sorted = useMemo(
    () => sortEvents(events, order, languageCode).filter((event) => event.id !== excludedId),
    [events, order, languageCode, excludedId],
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
  const scope = usePlaceScope([longitude, latitude], bbox)
  const { searchCountry } = scope
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

  // Whether these filters were already on when this place first showed. Removing or changing one
  // here makes the rest the visitor's own decision. It is a store so it outlasts the drawer's
  // remounts, and read without subscribing because only this list ever writes it. A reload or a
  // shared link counts as carried over: nothing says otherwise.
  const appliedKey = filtersKey(filters)

  if (useArrivalFilters.getState().place !== at) {
    useArrivalFilters.setState({ place: at, filters: appliedKey })
  }
  const carried = useArrivalFilters.getState().filters === appliedKey

  // A searched place reads as groups, with `revealRows` still paging the first and last of them.
  // Without one, nothing is "here", so the list stays one undivided run.
  const sections = useMemo(
    () =>
      hasSearchCenter ? splitResults(sorted, { ...scope, keepOrder: order === 'soonest' }) : null,
    [sorted, scope, order, hasSearchCenter],
  )
  const online = useMemo(
    () => (sections ? orderOnline(sections.online, order, languageCode) : []),
    [sections, order, languageCode],
  )
  const hereIds = useMemo(() => new Set(sections?.here.map((event) => event.id)), [sections])

  const { rows, more, next, total } = useMemo(
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
  const justOutsideId = useId()
  // A search that started from the visitor's own position measures from them, so the cards say
  // "from you".
  const fromYou = scope.nearVisitor
  // A distance needs a point the visitor can name: themselves, or the place they searched. A
  // search with neither (a country with a weekday, measured from wherever the map was) shows none.
  const named = fromYou || Boolean(placeName.current.name)
  // With nothing in the place or just outside it, the other cities open by themselves, and with
  // none of those either, the online classes do.
  const nothingClose = sections?.here.length === 0 && sections?.justOutside.length === 0
  const openNearby = folds.isOpen('nearby', nothingClose)
  const openOnline = folds.isOpen('online', nothingClose && sections?.nearby.length === 0)

  // Opening "Other cities" widens the map to show them, and closing it comes back to the place.
  const toggleNearby = (open: boolean) => {
    folds.setOpen('nearby', open)
    if (!sections) return
    const around = [...sections.justOutside, ...sections.nearby]
    const center: [number, number] = [longitude, latitude]
    const place = bbox as [number, number, number, number] | undefined
    // Everything outside the place when it opens. Closed, what the search framed on arrival.
    const frame = open
      ? boundsWith(place, center, around, around.length)
      : searchFrame(sections, place, center)

    frameSearch({ bbox: frame, center })
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

      return sections?.size === 'area' || !named || event.distance === undefined
        ? name
        : `${name} · ${formatDistance(event.distance, regionalLocale(locale))}`
    },
    [searchCountry, regionNames, locale, sections?.size, named],
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
    const { here, justOutside, nearby, distant, size } = sections
    const hereRows = rows.filter((event) => hereIds.has(event.id))
    const distantRows = rows.filter((event) => !hereIds.has(event.id))
    const place = placeName.current.name
    const nothing =
      here.length + justOutside.length + nearby.length + online.length + distant.length === 0
    const hideDistance = size === 'area' || !named
    // A search from the visitor's own position is about them, not the village their point
    // falls in: "In Choteč" over classes in Prague would read as a promise about Choteč.
    const hereTitle = fromYou
      ? t('search.sections.near_you')
      : !place
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

    // A filter chosen for this place was a decision, and needs no comment while classes remain. One
    // that came along from earlier, or that leaves the place empty, is worth saying out loud.
    const filterNotice = hasActiveFilters(filters) &&
      !nothing &&
      (carried || here.length === 0) && (
        <FilterRelief
          bbox={bbox}
          here={here.length}
          latitude={latitude}
          longitude={longitude}
          nearby={justOutside.length + nearby.length}
          place={place}
        />
      )

    return (
      <>
        {nothing && <EmptyResults scoped bbox={bbox} latitude={latitude} longitude={longitude} />}
        {here.length === 0 && !nothing && (
          <NoClassesHere
            bbox={bbox}
            fromYou={fromYou}
            latitude={latitude}
            longitude={longitude}
            place={place}
            spot={size === 'spot'}
          />
        )}
        {here.length === 0 && filterNotice}
        {here.length > 0 && (
          <section ref={listRef}>
            <ResultsHeading count={here.length}>{hereTitle}</ResultsHeading>
            {/* The map went wide when this group opened, while this heading still names the place.
                On a lowered phone sheet this is the one line that says why the two differ. */}
            {openNearby && size !== 'area' && (
              <p className="px-gutter pb-1 text-sm text-gray-11">
                {t('search.sections.map_wider')}
              </p>
            )}
            {filterNotice}
            <EventsList
              distanceFrom={fromYou ? 'you' : size === 'town' ? 'centre' : undefined}
              events={hereRows}
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
        {/* Close enough to count, but not in the place: shown in full, under the same small label
            the first screen puts over its country list, so nobody reads them as in the town. */}
        {justOutside.length > 0 && (
          <section aria-labelledby={justOutsideId}>
            <h3
              className="px-gutter pt-4 pb-1 text-xs font-medium tracking-[0.08em] text-gray-11 uppercase"
              id={justOutsideId}
            >
              {place
                ? t('search.sections.just_outside', { place })
                : t('search.sections.just_outside_here')}
            </h3>
            <EventsList events={justOutside} placeLineFor={placeLineFor} />
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
        <AddClassEntry
          hint={t('submit.chrome.add_hint')}
          href={addClassPath()}
          label={t('submit.chrome.add_row')}
        />
      </>
    )
  }

  return (
    <>
      <ResultCountStatus total={total} />
      <div ref={listRef}>
        {rows.length === 0 ? (
          <EmptyResults latitude={latitude} longitude={longitude} />
        ) : (
          // No searched place, so a distance would count from the middle of the map.
          <EventsList hideDistance events={rows} />
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
      {/* Under the list and under every empty state alike, here and after a place's groups: the
          flow opens at the root (#147). */}
      <AddClassEntry
        hint={t('submit.chrome.add_hint')}
        href={addClassPath()}
        label={t('submit.chrome.add_row')}
      />
    </>
  )
}

// A group's title that doesn't fold. It reads as the title of the list, since on this view the
// header above it is a search field.
function ResultsHeading({ children, count }: { children: ReactNode; count: number }) {
  return (
    <h3 className="flex items-baseline gap-2 px-gutter pt-3 pb-1 text-xl">
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
        <div className="flex justify-center px-gutter pt-2 pb-4">
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

// What the visitor's filters are costing them, and the one step that gives the most back:
// "Remove Chinese (3 classes)". A filter can follow someone from an earlier search, so this says it
// outright rather than leave them to work out why a place looks empty. It sits on the panel's
// gutter, like every row.
//
// Each candidate re-reads the feed without one filter. These are all client-side passes over the
// feed already in memory, not requests, and nothing here runs until a filter is on.
function useFilterRelief(
  latitude: number,
  longitude: number,
  gained: (events: EventSlim[]) => number,
) {
  const { locale } = useLocale()
  const filters = useEventFilters()
  const pills = useFilterPills()
  const results = useQueries({
    queries: pills.map((pill) =>
      eventsQuery(latitude, longitude, withoutFilter(filters, pill.key), locale),
    ),
  })

  return pills
    .map((pill, index) => ({ pill, count: gained(results[index]?.data ?? []) }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count)
}

function ReliefActions({
  best,
  many,
}: {
  best?: { pill: FilterPill; count: number }
  many: boolean
}) {
  const { t } = useTranslation()
  const { clearFilters } = useSetFilters()

  return (
    <div className="flex flex-wrap items-center gap-2">
      {best && (
        <Button
          className="h-11"
          color="primary"
          size="md"
          variant="solid"
          onClick={best.pill.onRemove}
        >
          {t('search.filtered.remove', { label: best.pill.label, count: best.count })}
        </Button>
      )}
      {(!best || many) && (
        <Button
          className="h-11"
          color={best ? 'neutral' : 'primary'}
          size="md"
          variant={best ? 'ghost' : 'solid'}
          onClick={clearFilters}
        >
          {t('filters.chrome.clear')}
        </Button>
      )}
    </div>
  )
}

function FilterRelief({
  latitude,
  longitude,
  bbox,
  place,
  here,
  nearby,
}: {
  latitude: number
  longitude: number
  bbox?: BBox
  place: string
  here: number
  nearby: number
}) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const { clearFilters } = useSetFilters()
  const scope = usePlaceScope([longitude, latitude], bbox)
  const { data: unfiltered } = useQuery(eventsQuery(latitude, longitude, DEFAULT_FILTERS, locale))
  const all = useMemo(
    () => (unfiltered ? splitResults(unfiltered, scope) : null),
    [unfiltered, scope],
  )
  const hiddenHere = all ? all.here.length - here : 0
  const hiddenNearby = all ? all.justOutside.length + all.nearby.length - nearby : 0
  // A class back in the place itself is worth more than one in the next town. The step offered
  // counts whichever of the two this sentence is about.
  const inPlace = hiddenHere > 0
  const relief = useFilterRelief(latitude, longitude, (events) => {
    const groups = splitResults(events, scope)

    return inPlace
      ? groups.here.length - here
      : groups.justOutside.length + groups.nearby.length - nearby
  })

  if (!inPlace && hiddenNearby <= 0) return null

  const best = relief[0]

  // One quiet line. Classes may well be on screen, and the filter may be the visitor's only free
  // day, so this mentions the cost and never presses for the filter to go.
  return (
    <p className="flex flex-wrap items-center gap-x-2 px-gutter text-sm text-gray-11" role="status">
      <span>
        {inPlace
          ? t('search.filtered.hidden_here', { count: hiddenHere, place })
          : t('search.filtered.hidden_nearby', { count: hiddenNearby })}
      </span>
      <button
        className="min-h-11 text-start font-medium text-primary underline outline-none focus-visible:ring-2 focus-visible:ring-primary-8"
        type="button"
        onClick={best ? best.pill.onRemove : clearFilters}
      >
        {best
          ? t('search.filtered.remove_short', { label: best.pill.label })
          : t('filters.chrome.clear')}
      </button>
    </p>
  )
}

// The place itself has nothing. The line says so before the nearest classes take over, so a class
// 146 km away is never read as being in the place. When it is the filters that emptied it, it
// isn't "yet".
function NoClassesHere({
  latitude,
  longitude,
  bbox,
  place,
  spot,
  fromYou,
}: {
  latitude: number
  longitude: number
  bbox?: BBox
  place: string
  spot: boolean
  /** The search started from the visitor's own position, so it is "near you". */
  fromYou: boolean
}) {
  const { t } = useTranslation()
  const { locale, regionNames } = useLocale()
  const scope = usePlaceScope([longitude, latitude], bbox)
  const countrySite = useCountrySite()
  const active = hasActiveFilters(useEventFilters())
  const { data: unfiltered } = useQuery({
    ...eventsQuery(latitude, longitude, DEFAULT_FILTERS, locale),
    enabled: active,
  })
  const emptied = active && unfiltered ? splitResults(unfiltered, scope).here.length > 0 : false

  if (countrySite) {
    const country = regionNames.of(countrySite.countryCode) ?? countrySite.countryCode

    // The panel fills the body when it stands alone. Here the groups follow it, so it takes only
    // the room it needs.
    return (
      <div className="[&>*]:!h-auto">
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
      </div>
    )
  }

  const title = emptied
    ? t('search.no_classes.filtered', { place })
    : fromYou
      ? t('search.no_classes.near_you')
      : !place
        ? t('search.no_classes.nowhere')
        : t(spot ? 'search.no_classes.near' : 'search.no_classes.here', { place })

  return (
    <div className="px-gutter pt-3 pb-2">
      <h3 className="text-xl">{title}</h3>
    </div>
  )
}

// This renders when no results exist to show at all. The list has nothing to fall back on, so this
// is the one state where the filter's way out IS the screen.
function EmptyResults({
  latitude,
  longitude,
  bbox,
  scoped = false,
}: {
  latitude: number
  longitude: number
  bbox?: BBox
  /** Count only what a removed filter would put in this place's own groups, not the whole feed. */
  scoped?: boolean
}) {
  const { t, i18n } = useTranslation()
  const { regionNames } = useLocale()
  const active = hasActiveFilters(useEventFilters())
  const countrySite = useCountrySite()
  const scope = usePlaceScope([longitude, latitude], bbox)
  const relief = useFilterRelief(latitude, longitude, (events) => {
    if (!scoped) return events.length
    const { here, justOutside, nearby, online } = splitResults(events, scope)

    return here.length + justOutside.length + nearby.length + online.length
  })

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

  if (active) {
    return (
      <div className="flex flex-col gap-3 px-gutter py-4" role="status">
        <h3 className="text-xl">{t(rewordedKey(i18n, 'search.filtered.none'))}</h3>
        <ReliefActions best={relief[0]} many={relief.length > 1} />
      </div>
    )
  }

  return <FallbackPanel hasSearchChrome align="start" kind="empty" />
}
