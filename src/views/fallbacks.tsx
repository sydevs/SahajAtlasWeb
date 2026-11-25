import type { FallbackProps } from 'react-error-boundary'
import type { FallbackAlign, FallbackKind } from '@/components/molecules'
import type { StackEntry } from '@/lib/shape'

import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'

import { DrawerBody, DrawerHeader, DrawerToolbar } from '@/components/atoms/Drawer'
import { Spinner } from '@/components/atoms/Spinner'
import { Skeleton, SkeletonLine } from '@/components/atoms/Skeleton'
import { CENTERED_BODY, FallbackPanel, ListToolbar, SortMenu } from '@/components/molecules'
import { MapSearchSkeleton } from '@/components/organisms/Mapbox/MapSearchSkeleton'
import {
  EventDetailsSkeleton,
  EventHeaderSkeleton,
} from '@/components/organisms/EventDetails/EventDetailsSkeleton'
import { eventTitlesQuery, regionQuery, regionsQuery } from '@/config/api'
import { useWidgetMode } from '@/config/mode'
import { useIsWideWidget } from '@/config/responsive'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { classifyError, errorMessage } from '@/lib/report'
import { baseStackEntry, isoCountryCode, nearestKnownRegion, resolveStack } from '@/lib/shape'
import { LOADING_ATTR } from '@/views/DrawerStack/use-fit-snap'
import { ClassListSkeleton, PlaceListSkeleton, guessListsPlaces } from '@/views/BootFallback'
import { BackButton, NavHeader, NavRow } from '@/views/nav'
import {
  CalendarButton,
  ExpandSheetButton,
  FilterButton,
  SearchButton,
  SearchField,
  useDrawerControl,
} from '@/views/shared'

/**
 * Whether this route's chrome leads with the geocoder, rather than a title — the root and
 * the search view, which get the header their own view would render.
 *
 * Both the chrome, to render the field, and the body, to suppress its own, read this. A
 * `not-found` at `/` or `/search` is a DEAD_END row, which asks for a geocoder, so
 * without this check the screen would draw two. `docs/rules/i18n-and-state.md` states
 * the invariant — "`visibleActions` narrows by surface … a geocoder already in the
 * chrome" — and this function implements it.
 */
const leadsWithGeocoder = (
  entry: StackEntry | undefined,
  // This is a type predicate, not a plain boolean. The chrome early-returns on it, and the
  // code after that return reads `entry.slug`/`entry.id`. So it must narrow away `undefined`
  // and the search variant, exactly as the inline check it replaced did.
): entry is undefined | Extract<StackEntry, { kind: 'search' }> => !entry || entry.kind === 'search'

// What a DRAWER adds around the shared fallback body — the chrome that survives when
// a view cannot render, and the routing knowledge only a drawer has. What the body
// itself says and offers lives in one table (`ERROR_POLICY`, molecules/Fallbacks),
// shared with the app-level fallback and with every empty list.
//
// The governing rule, which every component here obeys: THE FALLBACK MUST NEVER
// THROW. It runs where a throw would escape to the app-level boundary and blank the
// whole widget inside someone else's page. So it is built in layers, and a failure in
// an outer one costs only that layer:
//
//   0 — the frame (`DrawerChrome`): a header plus a working way back, rebuilt
//       from the URL and already-cached data. Only total calls — `t()` with
//       `defaultValue`, a context read, non-suspending cache reads, and
//       `resolveStack`, which is pure.
//   1+2 — the message and the offer, layered inside `FallbackPanel` (see its doc
//       comment).
//
// Split out of `views/shared.tsx` (issue #89), which had grown to hold the drawer
// controls, the search field, the geolocation suggestion, AND all of this.

/**
 * The header a drawer keeps when its view cannot render — while loading, or after it
 * threw.
 *
 * Every view renders its own `DrawerHeader` *inside* the boundary and below its
 * `useSuspenseQuery`, so a throw or a suspend erases the header and its Back button
 * along with the content. That left an error state with no way out of the drawer at
 * all (issue #89), and a load with nothing on screen to say which thing was opening.
 *
 * Deriving the title from the URL plus already-cached data, rather than from the
 * query that is failing or pending, is what makes this worth rendering instead of
 * "Loading…".
 *
 * It cannot THROW. Every lookup is a non-suspending cache read that degrades to
 * `undefined`. Its own `t()` calls carry a `defaultValue`. An unrecognised route
 * simply omits the title — a header with only a way back still beats no header.
 *
 * Nor can it SUSPEND on a string. `useLocale()` and every control this renders read
 * i18next through a plain `useTranslation()`, which is always ready: the English
 * snapshot is bundled and there is no backend to wait on (`config/i18n.ts`). So a
 * language switch re-renders this in place.
 */
export function DrawerChrome({
  loading = false,
  notFound = false,
}: {
  /**
   * The view is on its way, not broken: placeholders stand where its title and field will be,
   * and the field is drawn rather than mounted.
   */
  loading?: boolean
  /** The page failed because the place doesn't exist, so nothing can be scoped to it. */
  notFound?: boolean
}) {
  const { t } = useTranslation()
  const { locale, regionNames: countryNames } = useLocale()
  const { hasMap } = useWidgetMode()
  const { collapsed } = useDrawerControl()
  const location = useLocation()
  // This is cache-only (`enabled: false`), not merely non-suspending. It renders on EVERY
  // loading and error state, so a fetch here would re-issue a read on exactly the failures
  // where the backend is already the problem. A miss costs the title, never the frame. Both go
  // through the shared factories, so the keys cannot drift from the ones the loaders write. A
  // cache-only read under a divergent key does not error. It silently misses.
  const { data: regions } = useQuery({ ...regionsQuery(), enabled: false })
  const { data: titles } = useQuery({ ...eventTitlesQuery(locale), enabled: false })

  // The same peel DrawerStack applies: a trailing `filters` over a `calendar` is a
  // separate overlay drawer, so the BASE drawer's chrome must still name the
  // calendar. Without this, a calendar that fails underneath an open filter overlay
  // titles itself "Filters".
  const entry = baseStackEntry(resolveStack(location.pathname), hasMap)
  // The region tree is the whole global list, and this re-renders on every location
  // and drawer-control change, so this does not re-scan it for a node that only
  // moves with the slug.
  const regionSlug = entry?.kind === 'region' ? entry.slug : undefined
  const regionNode = useMemo(
    () =>
      regionSlug === undefined ? undefined : regions?.find((node) => node.slug === regionSlug),
    [regions, regionSlug],
  )
  // RegionView's own heading for a country, which needs no region tree: a deep link names the
  // country at once.
  const countryCode = isoCountryCode(regionSlug)
  const regionName = (countryCode && countryNames.of(countryCode)) || regionNode?.name || undefined

  const title = (() => {
    switch (entry?.kind) {
      case 'region':
        return regionName
      case 'online':
        return t('online.title', { defaultValue: 'Online Classes' })
      case 'event':
        return titles?.get(entry.id)
      case 'search':
        return t('search.chrome.title', { defaultValue: 'Search' })
      case 'calendar':
        return t('calendar.title', { defaultValue: 'Calendar' })
      case 'filters':
        return t('filters.chrome.title', { defaultValue: 'Filters' })
      case 'register':
        return t('registration.form.title', {
          defaultValue: 'Register for Meditation',
        })
      case 'share':
        return t('share.title', { defaultValue: 'Share Meditation' })
      default:
        return undefined
    }
  })()

  // A LOADING chrome gets the field's shape, not a working field. `SearchField` mounts a Mapbox
  // Geocoder — a shadow-DOM custom element bound to the live map. This fallback is freshly
  // mounted per path inside DrawerStack's keyed view layer, so on a cold start it would
  // instantiate one while the map is still initialising, then tear it down again the moment the
  // view mounts its own. An ERROR chrome keeps the real field. There it is the escape hatch.
  const field = loading ? (
    <div className="min-w-0 flex-1">
      <MapSearchSkeleton />
    </div>
  ) : (
    <SearchField />
  )

  // The root and the search view lead with the geocoder, rather than a title, so
  // they get the header their view would render. Everything in it is a NAVIGATION —
  // a new search, a filter drawer — not a read of the data that failed, so none of
  // it needs disabling: on an `offline` search the field is the most useful thing on
  // screen, since a new URL remounts the boundary and may well succeed.
  if (!entry) {
    // CountriesView's header: the field, then Filters (or the expand control on a collapsed sheet).
    return (
      <DrawerHeader>
        {field}
        {collapsed ? <ExpandSheetButton /> : <FilterButton iconOnly />}
      </DrawerHeader>
    )
  }

  if (entry.kind === 'search') {
    // SearchView's header and toolbar.
    return (
      <>
        <DrawerHeader>
          <BackButton iconOnly />
          {field}
          <ExpandSheetButton />
        </DrawerHeader>
        <DrawerToolbar>
          <ListToolbar>
            <FilterButton />
            <SortMenu />
          </ListToolbar>
        </DrawerToolbar>
      </>
    )
  }

  // A class loading takes EventView's own header, so the title lands where the real one will.
  if (loading && entry.kind === 'event') {
    return <EventHeaderSkeleton nav={<NavRow />} title={title} />
  }

  // The view's own header, so nothing moves when the view arrives. No title when nothing
  // resolved: a blank <h2> is a heading with no name, worse for a screen reader than none. A
  // place still loading draws its title's line instead.
  const pendingTitle = loading && entry.kind === 'region' && !title
  // A place whose classes are coming says what RegionView will say over them.
  const pendingSubtitle =
    loading &&
    entry.kind === 'region' &&
    !guessListsPlaces(entry.path, regionNode?.level) &&
    t('common.chrome.all_classes_free')

  return (
    <NavHeader
      actions={
        <>
          {/* A region's own header offers these three, and all still work — they navigate
              rather than read. The calendar and the filters are scoped to the region whose page
              failed, which is exactly where a viewer wanted to be. Not for a place that doesn't
              exist: there is nothing to scope them to, and the message's own way out is the
              only one that leads anywhere. */}
          {entry.kind === 'region' && !notFound && (
            <>
              <CalendarButton regionSlug={entry.slug} />
              <SearchButton />
              <FilterButton iconOnly />
            </>
          )}
          {entry.kind === 'online' && <SearchButton />}
          {entry.kind === 'calendar' && <FilterButton iconOnly />}
        </>
      }
      close={entry.kind === 'filters'}
      subtitle={pendingSubtitle || undefined}
      title={
        pendingTitle ? (
          <Skeleton>
            <SkeletonLine className="text-xl" width="w-1/2" />
          </Skeleton>
        ) : (
          title
        )
      }
    />
  )
}

const LOADING = { [LOADING_ATTR]: '' }

/**
 * The Suspense fallback for a view whose data is still loading: the view's own header (its way
 * back and its controls work), over placeholders shaped like the content on its way. Each is
 * marked `LOADING_ATTR`, so the sheet and the panel hold their height until the content arrives
 * rather than fitting the placeholder first.
 */
export function DrawerLoading() {
  const { t } = useTranslation()
  const { hasMap } = useWidgetMode()
  const isWide = useIsWideWidget()
  const location = useLocation()
  const entry = baseStackEntry(resolveStack(location.pathname), hasMap)
  const { data: regions } = useQuery({ ...regionsQuery(), enabled: false })

  const body = (() => {
    switch (entry?.kind) {
      case undefined:
        return <PlaceListSkeleton icons />
      case 'region': {
        const level = regions?.find(({ slug }) => slug === entry.slug)?.level
        const places = guessListsPlaces(entry.path, level)

        return places ? <PlaceListSkeleton /> : <ClassListSkeleton />
      }
      case 'online':
        return <ClassListSkeleton online />
      case 'search':
        return <ClassListSkeleton />
      case 'event':
        // The phone sheet pins Register to its foot once the class arrives, so the placeholder
        // leaves it out there.
        return (
          <div {...LOADING}>
            <p className="sr-only" role="status">
              {t('common.a11y.loading')}
            </p>
            <EventDetailsSkeleton ctaInline={!hasMap || isWide} />
          </div>
        )
      default:
        return null
    }
  })()

  return (
    <>
      <DrawerChrome loading />
      {body ? <DrawerBody>{body}</DrawerBody> : <DrawerLoadingBody />}
    </>
  )
}

/**
 * The spinner alone, for a Suspense fence that sits BELOW a view's own header — the
 * calendar's grid. The chrome-ful `DrawerLoading` there would draw a second header,
 * with a second Back button, under the one CalendarControls already renders.
 *
 * This is the loading counterpart of `DrawerErrorBody`/`ErrorPanel` — same split,
 * same reason.
 */
export function DrawerLoadingBody() {
  const { t } = useTranslation()

  return (
    <DrawerBody className={CENTERED_BODY}>
      {/* Uses `srLabel`, not `label`: the word is announced, not drawn. A visible "Loading…"
          under the glyph says nothing a spinner does not already say, and it is what pushed
          the glyph itself off centre — the column centres, so the label's height sits half
          of it below the middle. Screen readers still get it through the Spinner's own
          `role="status"`. */}
      <Spinner color="secondary" srLabel={t('common.a11y.loading')} />
    </DrawerBody>
  )
}

/**
 * Which posture the fallback takes in this view's body.
 *
 * The **list** views — the root country index, a region, its online roll-up, and
 * search — put content at the top-left of the body, so a fallback standing in for
 * that list belongs there too. Centring it moves the sentence away from where the
 * reader is already looking, and makes the drawer read as a different kind of
 * screen. Everything else (an event, a registration, a share sheet, the calendar) is
 * a single composed panel with no such anchor, so its fallback centres.
 *
 * This is derived from the URL, rather than passed down, because the view
 * boundary's fallback is mounted by `DrawerStack` — the failing view never gets to
 * say anything about it. The empty-list states call `FallbackPanel` directly and
 * pass `align` themselves.
 */
const LIST_KINDS = new Set<StackEntry['kind']>(['region', 'online', 'search'])

const fallbackAlign = (kind: StackEntry['kind'] | undefined): FallbackAlign =>
  // `undefined` is the root — CountriesView, the country index, which is a list.
  kind === undefined || LIST_KINDS.has(kind) ? 'start' : 'center'

/**
 * Which noun a dead link should name. `not-found` ("what you were looking for") is
 * the honest generic, but the drawer always knows better than that — the URL says
 * whether the viewer was opening an event or a place, and `<event>/register` is
 * still about the event. Only the routes with no entity fall through to the
 * generic.
 *
 * Each is a row of `ERROR_POLICY`, rather than a message override, so the sentences
 * live beside every other one, and the "fallbackText matches the shipped en copy"
 * test covers them too.
 */
const notFoundKind = (kind: StackEntry['kind'] | undefined): FallbackKind => {
  switch (kind) {
    case 'event':
    case 'register':
    case 'share':
      return 'not-found-event'
    case 'region':
    case 'online':
      return 'not-found-region'
    default:
      return 'not-found'
  }
}

/**
 * The error content itself, with no drawer wrapper — for a boundary that sits INSIDE
 * a view's existing `DrawerBody` (the results list, the lazy event details).
 * Wrapping those in a second `DrawerBody` would nest one scroll container inside
 * another.
 *
 * Used wherever the view's own chrome is still on screen and still working, so the
 * shared `DrawerChrome` would be a duplicate header.
 *
 * All it adds to the shared `FallbackPanel` is the two things only a routed drawer
 * knows: which entity the dead link named, and a geocoder to name another one.
 */
export function ErrorPanel({ error, resetErrorBoundary }: FallbackProps) {
  const { t } = useTranslation()
  const { hasMap } = useWidgetMode()
  const location = useLocation()
  const kind = classifyError(error)
  // The SAME entry the chrome above it names (`baseStackEntry`, not a raw `.at(-1)`)
  // — otherwise a calendar failing underneath an open filter overlay gets a header
  // saying "Calendar" over a body reasoning about "Filters".
  const entry = baseStackEntry(resolveStack(location.pathname), hasMap)

  return (
    <FallbackPanel
      align={fallbackAlign(entry?.kind)}
      // The root and search chromes already lead with a geocoder, and a dead link
      // asks for one — so without this check the screen would draw two: the
      // header's and the body's. This uses the same predicate the chrome uses, so
      // they cannot disagree about which routes those are.
      hasSearchChrome={leadsWithGeocoder(entry)}
      kind={kind === 'not-found' ? notFoundKind(entry?.kind) : kind}
      // The thrown developer string is not the headline. It is untranslated text written for
      // a developer, rendered to a viewer inside someone else's page. It survives as report
      // context only (issue #89). `FallbackPanel` defaults to the sentence.
      reportContext={errorMessage(error) ?? undefined}
      resetErrorBoundary={resetErrorBoundary}
    >
      <SearchField
        label={t('common.errors.search_label', { defaultValue: 'Or search for a place' })}
      />
    </FallbackPanel>
  )
}

/** `ErrorPanel` in its own `DrawerBody` — for a boundary whose child OWNS the body,
 *  rather than living inside one (the calendar grid renders its own). */
export function DrawerErrorBody(props: FallbackProps) {
  return (
    <DrawerBody>
      <ErrorPanel {...props} />
    </DrawerBody>
  )
}

/**
 * A dead link still names a place. The body offers that place's classes, so the map shows it
 * rather than sitting on the world behind that sentence. Rendered only for a not-found: after a
 * server or network failure, this read would go at the backend that just failed.
 */
function FrameNearestRegion() {
  const { locale } = useLocale()
  const location = useLocation()
  const { frameRegion } = useMapController()
  const { data: regions } = useQuery({ ...regionsQuery(), enabled: false })
  const slug = regions
    ? nearestKnownRegion(location.pathname, new Set(regions.map((node) => node.slug)))
    : undefined
  const { data: region } = useQuery({ ...regionQuery(slug ?? '', locale), enabled: Boolean(slug) })

  useEffect(() => {
    if (region) frameRegion(region)
  }, [region, frameRegion])

  return null
}

/**
 * The ErrorBoundary fallback for a whole view — kept local to the drawer, so one
 * failing view never blanks the stack. Mirrors the top-level ErrorFallback
 * (molecules/Fallbacks): the same classified copy and the same FallbackActions,
 * differing only in chrome.
 *
 * Renders `DrawerChrome` above the body, because the view's own header went down
 * with it. Before that, an error left the drawer with no way back — and in the
 * configurations with no swipe (desktop, map-less), no Esc either, so the viewer was stuck on the error screen with no way back to the map
 * (issue #89).
 */
export function DrawerErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <>
      {classifyError(error) === 'not-found' && <FrameNearestRegion />}
      <DrawerChrome notFound={classifyError(error) === 'not-found'} />
      <DrawerErrorBody error={error} resetErrorBoundary={resetErrorBoundary} />
    </>
  )
}
