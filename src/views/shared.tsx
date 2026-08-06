import type { MapSearchProps } from '@/components/organisms/Mapbox/MapSearch'
import type { GeocodingFeature } from '@mapbox/search-js-core'
import type { DependencyList, ReactNode } from 'react'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigationType, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'

import { Button } from '@/components/atoms/Button'
import { CalendarIcon, CloseIcon, FilterIcon, ListIcon, SearchIcon } from '@/components/atoms/Icons'
import { GeolocationPrompt, OnwardOffer } from '@/components/molecules'
import { MapSearch } from '@/components/organisms'
import api from '@/config/api'
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
import { atlasError } from '@/lib/report'
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
  // `useSuspense: false` — this renders inside the error/loading chrome, where suspending
  // on an in-flight namespace (a language switch mid-error) would escape the boundary and
  // blank the widget instead of showing the failure.
  const { t } = useTranslation('common', { useSuspense: false })
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
  // See CloseButton: also rendered by the error/loading chrome, so it must not suspend.
  const { t } = useTranslation('common', { useSuspense: false })
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
 * The "no events" state for the region/online drawers when their list comes back empty: a
 * region whose events have all ended, or an online roll-up reached by a hand-typed URL.
 *
 * Carries the SAME onward offer a dead link gets (issue #89) — the nearest ancestor that
 * does list classes, then the search field. It used to be deliberately action-less on the
 * grounds that an empty region isn't a wrong turn to retry or report; that's still true of
 * *retry* and *report*, but it left a viewer facing one sentence and nothing to press,
 * which is the same dead end whether the URL was wrong or merely barren.
 *
 * The ladder reads the URL's ancestry, so a 0-event Antwerpen offers Belgium rather than
 * offering itself back. Search keeps its own filter-aware empty state, which has better
 * reasons available (DynamicEventsList's EmptyResults).
 */
export function EmptyEventList() {
  const { t } = useTranslation('common')
  const offer = useRecoveryOffer()

  return (
    <div className="p-4">
      <OnwardOffer message={t('filters.no_events')} offer={offer}>
        <SearchField
          label={t('error.search_label', { defaultValue: 'Search for a place' })}
          syncToUrl={false}
        />
      </OnwardOffer>
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
