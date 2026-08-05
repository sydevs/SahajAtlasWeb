import type { FallbackProps } from 'react-error-boundary'
import type { MapSearchProps } from '@/components/organisms/Mapbox/MapSearch'
import type { StackEntry } from '@/lib/shape'
import type { GeocodingFeature } from '@mapbox/search-js-core'
import type { DependencyList, ReactNode } from 'react'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigationType, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { ErrorBoundary } from 'react-error-boundary'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { Spinner } from '@/components/atoms/Spinner'
import { Alert } from '@/components/atoms/Alert'
import { Button } from '@/components/atoms/Button'
import { CalendarIcon, CloseIcon, FilterIcon, ListIcon, SearchIcon } from '@/components/atoms/Icons'
import {
  ErrorActions,
  GeolocationPrompt,
  NotFoundOffer,
  useErrorDisplay,
} from '@/components/molecules'
import { MapSearch } from '@/components/organisms'
import api, { regionsQuery } from '@/config/api'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import { useCameraHistory } from '@/config/store'
import { useAtlasNavigate } from '@/hooks/use-atlas-navigate'
import { useEventFilters } from '@/hooks/use-filters'
import { useIpLocation } from '@/hooks/use-ip-location'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { useRecoveryOffer } from '@/hooks/use-recovery-offer'
import { approxBounds } from '@/lib/geo'
import { geocodeCountryCode } from '@/lib/geocode'
import { atlasError, reportInternalError } from '@/lib/report'
import {
  hasActivePlaceSearch,
  markGeolocationDismissed,
  readGeolocationDismissed,
  shouldShowGeolocationPrompt,
} from '@/lib/geolocation'
import {
  SEARCH_COUNTRY_PARAM,
  activeFilterCount,
  searchPath,
  atlasDepth,
  calendarPath,
  filtersFromParams,
  filtersToParams,
  isoCountryCode,
  resolvePath,
  resolveStack,
  sortFromParams,
  sortToParams,
} from '@/lib/shape'

// Collapse/expand + dismiss control for the sheet, provided by DrawerStack. Views
// use it for their close / list-toggle buttons, so those act on the ONE persistent
// vaul sheet directly (a plain navigation) rather than opening/closing a drawer —
// which is what kept the sheet from sliding out and back in on every transition.
export type DrawerControl = {
  collapsed: boolean
  canCollapse: boolean
  /**
   * Whether `dismiss()` would actually go somewhere. False only at the root, where there
   * is no parent to climb to and `navigate(-1)` would take the HOST page back. Read by the
   * error/loading chrome, which renders its own header and must not offer a dead control
   * (issue #89); the views' own headers don't need it, since a view that rendered at all
   * has a working stack around it.
   */
  canDismiss: boolean
  toggle: () => void
  dismiss: () => void
}

export const DrawerControlContext = createContext<DrawerControl>({
  collapsed: false,
  canCollapse: false,
  canDismiss: false,
  toggle: () => {},
  dismiss: () => {},
})

export const useDrawerControl = () => useContext(DrawerControlContext)

// The close affordance for the drawer views. Dismisses via the control seam (a
// navigation to the parent) rather than vaul's Close — closing the real drawer made
// the sheet animate shut and then re-open with the parent, which read as jarring.
export type DrawerTitleProps = {
  /** The drawer's visible heading. */
  title: ReactNode
  /** Optional muted line under it (region subtitle, event date, …). */
  subtitle?: ReactNode
  /**
   * A smaller standing note below the subtitle (e.g. "All events are free").
   * Distinct from `subtitle` in rank, not just size: the subtitle says which
   * thing this drawer is about, the note is a fact that holds for the whole list.
   */
  note?: ReactNode
}

/**
 * The title block every drawer header opens with. Previously copy-pasted across
 * five views, which let the weight drift (`font-bold` here vs the event panel's
 * `font-semibold`) and left all five as plain <div>s — so screen-reader users had
 * no heading to navigate the drawer content by. Renders a real <h2>: the dialog
 * itself is named by the sr-only Vaul.Title, so this is the content heading below
 * it, not a competing label.
 */
export function DrawerTitle({ title, subtitle, note }: DrawerTitleProps) {
  return (
    <div className="min-w-0">
      <h2 className="truncate text-lg font-semibold">{title}</h2>
      {subtitle && <div className="truncate text-sm text-gray-11">{subtitle}</div>}
      {note && <div className="truncate text-xs text-gray-11">{note}</div>}
    </div>
  )
}

/**
 * The drawer header's icon controls (close, list-toggle, filter) are all the same
 * Button preset, kept here as values rather than a wrapper component so the three
 * provably render identical chrome — the header reads as one set of buttons.
 */
const HEADER_CONTROL = { variant: 'ghost', isIconOnly: true, size: 'sm' } as const

export function CloseButton({ className }: { className?: string }) {
  const { t } = useTranslation('common')
  const { dismiss } = useDrawerControl()

  return (
    <Button {...HEADER_CONTROL} aria-label={t('close')} className={className} onClick={dismiss}>
      <CloseIcon size={20} />
    </Button>
  )
}

// The calendar affordance for region headers (RegionView): opens the full-width
// calendar pre-scoped to this region (`/calendar?region=<slug>`, pre-setting the
// Region filter). Same header-control chrome as the close control, so the header reads
// as one set of buttons.
export function CalendarButton({ regionSlug }: { regionSlug: string }) {
  const { t } = useTranslation('common')
  const navigate = useAtlasNavigate()

  return (
    <Button
      {...HEADER_CONTROL}
      aria-label={t('calendar.title')}
      onClick={() => navigate(calendarPath(regionSlug))}
    >
      <CalendarIcon size={20} />
    </Button>
  )
}

// The search affordance for region headers (RegionView): jumps to the
// distance-ranked search view. Renders the same header-control chrome as the
// close/filter controls so the header reads as one set of buttons.
export function SearchButton() {
  const { t } = useTranslation('common')
  const navigate = useAtlasNavigate()

  return (
    <Button {...HEADER_CONTROL} aria-label={t('search')} onClick={() => navigate(searchPath())}>
      <SearchIcon size={20} />
    </Button>
  )
}

// The stacked-list toggle in CountriesView's header: expands the collapsed peek into
// the country list, or collapses the open list back to the peek. Hidden where the
// sheet can't collapse (desktop / map-less).
export function CollapseToggle() {
  const { t } = useTranslation('common')
  const { collapsed, canCollapse, toggle } = useDrawerControl()

  if (!canCollapse) return null

  // At the peek it's a list toggle (expand the countries list); once opened past the
  // peek it becomes the usual close control (collapse back to the peek).
  return (
    <Button
      {...HEADER_CONTROL}
      aria-expanded={!collapsed}
      aria-label={collapsed ? t('explore') : t('close')}
      onClick={toggle}
    >
      {collapsed ? <ListIcon size={24} /> : <CloseIcon size={20} />}
    </Button>
  )
}

// The event-filters trigger that opens the filter drawer by navigating to
// `<current>/filters` (root → `/filters`, `/search` → `/search/filters`), preserving the
// search query so closing returns to the same search. Two shapes over one nav + count:
// the labeled ghost button for the list toolbar (SearchView), and — with `iconOnly` — an
// icon-only header control carrying the active count as a badge (CountriesView's header),
// so it reads as one set with the close/collapse chrome.
export function FilterButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const { t } = useTranslation('common')
  const navigate = useAtlasNavigate()
  const location = useLocation()
  const count = activeFilterCount(useEventFilters())

  const label = count > 0 ? `${t('filters.title')} (${count})` : t('filters.title')
  const to = `${location.pathname === '/' ? '' : location.pathname}/filters`
  const open = () => navigate({ pathname: to, search: location.search })

  if (iconOnly) {
    return (
      <Button {...HEADER_CONTROL} aria-label={label} className="relative" onClick={open}>
        <FilterIcon size={20} />
        {count > 0 && (
          <span
            aria-hidden
            className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-9 px-1 text-xs font-semibold leading-none text-primary-foreground"
          >
            {count}
          </span>
        )}
      </Button>
    )
  }

  return (
    <Button size="sm" variant="ghost" onClick={open}>
      <FilterIcon size={18} />
      {label}
    </Button>
  )
}

// The URL-only state that survives a new place search — the applied filters and the
// list sort (both presentation, not location). Re-encoding through the two codecs from
// an EMPTY base drops the searched location (`q`/`center`/`bbox`/`cc`) by construction;
// the caller then sets the new one. That's what keeps the previous country's `?cc` from
// leaking into the next search (it would offer the wrong country's website). Shared by
// SearchField + GeolocationSuggestion so a re-search never silently clears either
// slice — and a filter edit, which merges onto the current params
// (`filtersToParams(…, prev)`), preserves the searched country. The results list's
// reveal isn't in the URL at all: a new centre changes `revealKey`, so it resets on its
// own (see `use-reveal`).
function preserveSearchState(searchParams: URLSearchParams): URLSearchParams {
  return sortToParams(
    sortFromParams(searchParams),
    filtersToParams(filtersFromParams(searchParams)),
  )
}

// The geocoder search field used by CountriesView/SearchView headers. Selecting a
// place navigates to /search with the geocoded bbox + centre (the SearchView
// ranks events by distance from there). Carries the geocode→search behaviour that
// used to live in the removed SearchBar.
export function SearchField({
  label,
  syncToUrl,
}: Pick<MapSearchProps, 'label' | 'syncToUrl'> = {}) {
  const navigate = useAtlasNavigate()
  const [searchParams] = useSearchParams()

  const handleSelect = useCallback(
    (value: GeocodingFeature) => {
      // Carry the active filters + sort (both URL-only) across the re-search, resetting
      // only the searched location below.
      const params = preserveSearchState(searchParams)

      params.set('q', value.properties.full_address ?? '')
      if (value.properties.bbox) params.set('bbox', value.properties.bbox.toString())
      params.set(
        'center',
        `${value.properties.coordinates.longitude},${value.properties.coordinates.latitude}`,
      )

      // The country the place sits in, so an empty result set can offer that
      // country's own site (issue #82). Present for a country-level result and for a
      // town within one; absent (so simply not written) for an ocean or a
      // country-less feature.
      const countryCode = geocodeCountryCode(value)

      if (countryCode) params.set(SEARCH_COUNTRY_PARAM, countryCode)

      navigate(`/search?${params.toString()}`)
    },
    [navigate, searchParams],
  )

  return (
    <div className="min-w-0 flex-1">
      <MapSearch label={label} syncToUrl={syncToUrl} onSelect={handleSelect} />
    </div>
  )
}

// Context handed to a top view's frame callback. `isEntry` is true when the view is
// the session entry point (a fresh deep link / structural climb — depth 0) rather than
// an in-session push; a placeless view (OnlineView) frames its parent only then, so it
// never needs to re-derive history-awareness itself.
export type FrameContext = { isEntry: boolean }

// Only the top (active) view is rendered — ancestors are peek panels, not views — so
// each view frames the map for its level unconditionally on mount / when its inputs
// change. Centralized so the call sites are one line and their deps arrays stay honest:
// `deps` is spread into the effect's own array, so a per-view length is fine (it's
// fixed for any given call site across renders).
export function useFrameOnTop(frame: (ctx: FrameContext) => void, deps: DependencyList) {
  const location = useLocation()
  const navigationType = useNavigationType()
  const { hasMap, restore } = useMapController()

  useEffect(() => {
    // On a POP back to a remembered entry, restore the camera the user left rather
    // than re-deriving the framing — so closing an event returns to the prior
    // viewport/zoom (browser back/forward get this for free). Otherwise (a PUSH, or a
    // fresh deep link with no snapshot) frame normally, telling the view whether it's
    // the session entry point. `deps` is the caller's own list; location/navigationType/
    // hasMap/restore are stable for a mounted view.
    const snapshot =
      navigationType === 'POP' ? useCameraHistory.getState().read(location.key) : undefined

    if (hasMap && snapshot) restore(snapshot)
    else frame({ isEntry: atlasDepth(location) === 0 })
  }, [...deps])
}

// RegistrationView and ShareView both resolve an event from its route path and
// suspense-fetch it — shared here so the resolvePath + queryKey convention stays
// in one place. (EventView, one level up in the stack, already fetches the same
// event; TanStack Query's `['event', id, locale]` cache serves this call from that
// fetch, not a fresh network round trip.) `resolveStack` derives `eventPath` from
// the raw preceding URL segment without checking it's actually an event — a
// hand-typed `/india/register` would otherwise reach here as a region path — so
// bail out before firing a request for a non-existent `NaN` id; the nearest
// ErrorBoundary (DrawerErrorFallback) renders the not-found state instead.
export function useEventFromPath(eventPath: string) {
  const { locale } = useLocale()
  const resolved = resolvePath(eventPath)

  if (resolved?.kind !== 'event') {
    throw atlasError('not-found', `Not an event: ${eventPath}`)
  }

  return useSuspenseQuery({
    queryKey: ['event', resolved.id, locale],
    queryFn: () => api.getEvent(resolved.id),
  })
}

/**
 * The header a drawer keeps when its view can't render — while loading, or after it threw.
 *
 * Every view renders its own `DrawerHeader` *inside* the boundary and below its
 * `useSuspenseQuery`, so a throw or a suspend erases the header and its close button along
 * with the content. That left an error state with no way out of the drawer at all
 * (issue #89), and a load with nothing on screen to say which thing was opening.
 *
 * Deriving the title from the URL + already-cached data — rather than from the query that
 * is failing or pending — is what makes this worth rendering instead of "Loading…".
 *
 * Total by construction (rule: the fallback must never throw). Every lookup is a
 * non-suspending cache read that degrades to `undefined`, `t()` never suspends and always
 * carries a `defaultValue`, and an unrecognised route simply omits the title — a header
 * with only a close control still beats no header.
 */
export function DrawerChrome() {
  const { t } = useTranslation('common', { useSuspense: false })
  const { t: tEvents } = useTranslation('events', { useSuspense: false })
  const location = useLocation()
  const { locale } = useLocale()
  const { canDismiss } = useDrawerControl()
  // Non-suspending reads: a miss costs the title, never the frame.
  const { data: regions } = useQuery({ ...regionsQuery(), retry: false })
  const { data: titles } = useQuery<Map<number, string>>({
    queryKey: ['event-titles', locale],
    enabled: false,
  })

  const entry = resolveStack(location.pathname).at(-1)

  const title = (() => {
    switch (entry?.kind) {
      case 'region':
        return regions?.find((node) => node.slug === entry.slug)?.name ?? undefined
      case 'online':
        return t('online_classes', { defaultValue: 'Online Classes' })
      case 'event':
        return titles?.get(entry.id)
      case 'search':
        return t('search', { defaultValue: 'Search' })
      case 'calendar':
        return t('calendar.title', { defaultValue: 'Calendar' })
      case 'filters':
        return t('filters.title', { defaultValue: 'Filters' })
      case 'register':
        return tEvents('registration.register_meditation', {
          defaultValue: 'Register for Meditation',
        })
      case 'share':
        return tEvents('details.share_meditation', { defaultValue: 'Share Meditation' })
      default:
        return undefined
    }
  })()

  return (
    <DrawerHeader className="justify-between">
      {/* An empty <div> rather than an empty DrawerTitle when nothing resolved: a blank
          <h2> is a heading with no name, which is worse for a screen reader than no
          heading at all. It still holds the left slot so the control stays right-aligned. */}
      {title ? <DrawerTitle title={title} /> : <div />}
      {/* At the root there is nothing to climb to and `navigate(-1)` would take the host
          page back, so offer the collapse (which self-hides where it can't collapse)
          rather than a close that silently does nothing. */}
      {canDismiss ? <CloseButton /> : <CollapseToggle />}
    </DrawerHeader>
  )
}

// Suspense fallback for a view whose data is still loading — the shared chrome (so the
// drawer keeps its identity and its close control) over a spinner.
//
// TOP-ALIGNED, not centred. `DrawerBody` fills a sheet that is `h-dvh` (vaul computes its
// snap translates off the window height), while the mobile sheet only shows its top 300px
// — so `items-center` put the spinner at roughly `1.5·viewport − 300` from the top, i.e.
// BELOW THE FOLD. Loading rendered as a blank sheet on every phone: "nothing happened when
// I tapped". Same fix, same reason, in DrawerErrorFallback below (issue #89).
export function DrawerLoading() {
  const { t } = useTranslation('common')

  return (
    <>
      <DrawerChrome />
      <DrawerBody className="flex justify-center p-8">
        <Spinner color="secondary" label={t('loading')} />
      </DrawerBody>
    </>
  )
}

/**
 * Which noun a dead link should name. `error.not_found` ("what you were looking for") is
 * the honest generic, but the drawer always knows better than that — the URL says whether
 * the viewer was opening an event or a place, and `<event>/register` is still about the
 * event. Only the routes with no entity fall through to the generic.
 */
const notFoundMessageKey = (kind: StackEntry['kind'] | undefined): string => {
  switch (kind) {
    case 'event':
    case 'register':
    case 'share':
      return 'error.not_found_event'
    case 'region':
    case 'online':
      return 'error.not_found_region'
    default:
      return 'error.not_found'
  }
}

/**
 * The dead-end body: what was missing, one place to go, and a field to name somewhere
 * else (issue #89).
 *
 * Separate component because it reads data (`useRecoveryOffer`) and mounts a Mapbox custom
 * element — the risky layer that `ErrorPanel` wraps in its own boundary below.
 */
function NotFoundPanel({ message }: { message: string }) {
  const { t } = useTranslation('common', { useSuspense: false })
  const offer = useRecoveryOffer()

  return (
    <div className="p-4">
      <NotFoundOffer message={message} offer={offer}>
        {/* `syncToUrl={false}`: this URL is the dead one we've just reported, and embedded
            it lives in the host page's `#!` fragment — writing keystrokes into it spreads
            a broken link into anything the visitor copies. */}
        <SearchField
          label={t('error.search_label', { defaultValue: 'Search for a place' })}
          syncToUrl={false}
        />
      </NotFoundOffer>
    </div>
  )
}

/** The floor: no data, no hooks beyond `t`, so it can stand in when anything richer
 *  fails. Rendered by the boundary around `NotFoundPanel`. */
function RecoveryFloor({ message }: { message: string }) {
  return (
    <div className="p-4">
      <NotFoundOffer message={message} offer={{ kind: 'countries', path: '/' }} />
    </div>
  )
}

/**
 * The error content itself, with no drawer wrapper — for a boundary that sits INSIDE a
 * view's existing `DrawerBody` (the results list, the lazy event details). Wrapping those
 * in a second `DrawerBody` would nest one scroll container inside another.
 *
 * Used wherever the view's own chrome is still on screen and still working, so the shared
 * `DrawerChrome` would be a duplicate header.
 *
 * Splits on register: a dead link gets the neutral empty-state treatment with somewhere to
 * go; everything else gets the danger alert and the policy's buttons.
 */
export function ErrorPanel({ error, resetErrorBoundary }: FallbackProps) {
  const { t } = useTranslation('common', { useSuspense: false })
  const location = useLocation()
  const { kind, policy, message, reportContext } = useErrorDisplay(error)

  if (kind === 'not-found') {
    const entityMessage = t(notFoundMessageKey(resolveStack(location.pathname).at(-1)?.kind), {
      defaultValue: message,
    })

    return (
      // Layer 2 of the never-fail rule: the offer reads three caches and mounts a geocoder,
      // any of which could throw — and this is the screen that exists to explain a failure,
      // so it must not become a second one. On a throw it degrades to the floor rung, which
      // needs no data at all. Not `null`: unlike the report modal (off screen until asked),
      // this IS the screen, so failing to nothing would strand the viewer.
      <ErrorBoundary
        fallbackRender={() => <RecoveryFloor message={entityMessage} />}
        onError={(cause) => reportInternalError(cause, 'NotFoundPanel')}
      >
        <NotFoundPanel message={entityMessage} />
      </ErrorBoundary>
    )
  }

  return (
    <div className="flex flex-col items-start gap-3 p-4">
      <Alert align="start" className="max-w-xs" color="danger" description={message} role="alert" />
      <ErrorActions
        policy={policy}
        reportContext={reportContext}
        resetErrorBoundary={resetErrorBoundary}
      />
    </div>
  )
}

/** `ErrorPanel` in its own `DrawerBody` — for a boundary whose child OWNS the body rather
 *  than living inside one (the calendar grid renders its own). */
export function DrawerErrorBody(props: FallbackProps) {
  return (
    <DrawerBody>
      <ErrorPanel {...props} />
    </DrawerBody>
  )
}

/**
 * ErrorBoundary fallback for a whole view — kept local to the drawer so one failing view
 * never blanks the stack. Mirrors the top-level ErrorFallback (molecules/Fallbacks): the
 * same classified copy and the same ErrorActions, differing only in chrome.
 *
 * Renders `DrawerChrome` above the body, because the view's own header went down with it.
 * Before that, an error left the drawer with no close button — and in the configurations
 * with no peek strips (desktop, map-less) no swipe and no Esc either, so the viewer was
 * stuck on the error screen with no way back to the map (issue #89).
 */
export function DrawerErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <>
      <DrawerChrome />
      {/* Top-aligned for the reason spelled out on DrawerLoading above: centred content sat
          below the fold of the 300px mobile sheet, so the error state was invisible on
          every phone — the widget looked broken in a way that hid the explanation. */}
      <DrawerErrorBody error={error} resetErrorBoundary={resetErrorBoundary} />
    </>
  )
}

// The generic "no events" state for the region/online drawers when their list comes
// back empty: a region whose events have all ended, or an online roll-up reached by a
// hand-typed URL. Deliberately action-less — a 0-event region isn't a wrong turn to
// retry or report, which is why `getRegion` renders it rather than throwing (issue #89).
// Search has its own filter-aware empty state (DynamicEventsList's EmptyResults).
export function EmptyEventList() {
  const { t } = useTranslation('common')

  return (
    <div className="p-4">
      <Alert color="neutral" description={t('filters.no_events')} />
    </div>
  )
}

// A city-sized radius (km) so the suggested search frames a neighbourhood, not the
// pinpoint the IP guess resolves to.
const NEARBY_RADIUS_KM = 25

// The single shared wiring for the IP-geolocation nearby suggestion, rendered above
// the list on CountriesView / RegionView / SearchView so the behaviour isn't
// triplicated. Reads the passive IP location (one lookup per session; fails silently
// ⇒ nothing renders) and, on accept, navigates into the distance-ranked search
// centred on the guess — preserving the active URL filters exactly as SearchField
// does, plus a synthesized city-sized bbox so SearchView frames a neighbourhood
// rather than the pinpoint zoom it uses for a bare centre. `shouldShowGeolocationPrompt`
// (src/lib/geolocation.ts, fully unit-tested) owns the visibility conditions. Only the ×
// persists a (session-scoped) dismissal; accepting merely navigates — the prompt
// self-hides while you're viewing that area but returns once you leave it.
export function GeolocationSuggestion({
  regionCenter,
}: {
  regionCenter?: [number, number] | null
}) {
  const navigate = useAtlasNavigate()
  const [searchParams] = useSearchParams()
  const [dismissed, setDismissed] = useState(readGeolocationDismissed)
  // Skip the passive lookup when it couldn't be shown anyway — dismissed, or a place
  // search is already active — so those cases never ping the third-party service.
  const activeSearch = hasActivePlaceSearch(searchParams)
  const ipLocation = useIpLocation(!dismissed && !activeSearch)

  // The cached event feed powers the "is anything actually near?" guard.
  const { data: geojson } = useQuery({
    queryKey: ['geojson'],
    queryFn: () => api.getGeojson(),
    staleTime: GEOJSON_STALE_TIME,
  })

  const show = useMemo(
    () =>
      shouldShowGeolocationPrompt({
        guess: ipLocation,
        dismissed,
        activeSearch,
        geojson,
        regionCenter,
      }),
    [ipLocation, dismissed, activeSearch, geojson, regionCenter],
  )

  const handleSelect = useCallback(() => {
    if (!ipLocation) return

    // Carry the active filters + sort across the re-search (mirrors SearchField),
    // resetting only the searched location below.
    const params = preserveSearchState(searchParams)

    params.set('q', `${ipLocation.city}, ${ipLocation.country}`)
    params.set('center', `${ipLocation.longitude},${ipLocation.latitude}`)
    params.set(
      'bbox',
      approxBounds([ipLocation.longitude, ipLocation.latitude], NEARBY_RADIUS_KM).toString(),
    )

    // Same searched-country marker SearchField writes — the guess already carries the
    // code (it also orders an event's share targets), so an accepted suggestion that
    // lands in a program-less country gets the offer too.
    const countryCode = isoCountryCode(ipLocation.country_code)

    if (countryCode) params.set(SEARCH_COUNTRY_PARAM, countryCode)

    // Accepting must NOT persist a dismissal — only the × does (handleDismiss).
    // Zooming to the guess already hides the prompt on its own: the new URL carries
    // `?center`/`?q`, so `hasActivePlaceSearch` suppresses it while you're looking at
    // that area. Leaving the area (clearing the search) brings the suggestion back,
    // so it keeps offering until the user actually dismisses it.
    navigate(`/search?${params.toString()}`)
  }, [ipLocation, navigate, searchParams])

  const handleDismiss = useCallback(() => {
    markGeolocationDismissed()
    setDismissed(true)
  }, [])

  // `!ipLocation` is implied by `!show`, but narrows the type for the render below.
  if (!ipLocation || !show) return null

  return (
    <GeolocationPrompt city={ipLocation.city} onAccept={handleSelect} onClose={handleDismiss} />
  )
}
