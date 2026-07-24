import type { FallbackProps } from 'react-error-boundary'
import type { GeocodingFeature } from '@mapbox/search-js-core'
import type { DependencyList, ReactNode } from 'react'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigationType, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'

import { DrawerBody } from '@/components/atoms/Drawer'
import { Spinner } from '@/components/atoms/Spinner'
import { Alert } from '@/components/atoms/Alert'
import { Button } from '@/components/atoms/Button'
import { CloseIcon, FilterIcon, ListIcon } from '@/components/atoms/Icons'
import { NearbyPrompt } from '@/components/molecules'
import { MapSearch } from '@/components/organisms'
import api from '@/config/api'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import { useCameraHistory } from '@/config/store'
import { useAtlasNavigate } from '@/hooks/use-atlas-navigate'
import { useEventFilters } from '@/hooks/use-filters'
import { useIpLocation } from '@/hooks/use-ip-location'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { approxBounds } from '@/lib/geo'
import {
  hasActivePlaceSearch,
  markNearbyDismissed,
  readNearbyDismissed,
  shouldShowNearbyPrompt,
} from '@/lib/nearby'
import {
  activeFilterCount,
  atlasDepth,
  filtersFromParams,
  filtersToParams,
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
  toggle: () => void
  dismiss: () => void
}

export const DrawerControlContext = createContext<DrawerControl>({
  collapsed: false,
  canCollapse: false,
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

// The event-filters trigger for the list toolbar (SearchView + CountriesView): a
// labeled ghost button that opens the filter drawer by navigating to `<current>/filters`
// (root → `/filters`, `/search` → `/search/filters`), preserving the search query so
// closing returns to the same search. The active-filter count rides in the label
// (`Filters (2)`) rather than a badge, now that the control carries text.
export function FilterButton() {
  const { t } = useTranslation('common')
  const navigate = useAtlasNavigate()
  const location = useLocation()
  const count = activeFilterCount(useEventFilters())

  const label = count > 0 ? `${t('filters.title')} (${count})` : t('filters.title')
  const to = `${location.pathname === '/' ? '' : location.pathname}/filters`

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => navigate({ pathname: to, search: location.search })}
    >
      <FilterIcon size={18} />
      {label}
    </Button>
  )
}

// The URL-only state that survives a new place search — the applied filters and the
// list sort (both presentation, not location). Re-encoding through the two codecs drops
// the searched-location params (`q`/`center`/`bbox`/`all`); the caller then sets the new
// location. Shared by SearchField + NearbySuggestion so a re-search never silently clears
// either slice.
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
export function SearchField() {
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
      navigate(`/search?${params.toString()}`)
    },
    [navigate, searchParams],
  )

  return (
    <div className="min-w-0 flex-1">
      <MapSearch onSelect={handleSelect} />
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
    throw new Error(`Not an event: ${eventPath}`)
  }

  return useSuspenseQuery({
    queryKey: ['event', resolved.id, locale],
    queryFn: () => api.getEvent(resolved.id),
  })
}

// Suspense fallback for a view whose data is still loading. Renders only the sheet's
// inner body (a spinner) — the persistent DrawerContent supplies the sheet chrome —
// so loading doesn't remount or re-animate the drawer. Mirrors the top-level
// LoadingFallback (molecules/Fallbacks).
export function DrawerLoading() {
  const { t } = useTranslation('common')

  return (
    <DrawerBody className="flex items-center justify-center py-16">
      <Spinner color="secondary" label={t('loading')} />
    </DrawerBody>
  )
}

// ErrorBoundary fallback for a view whose query failed — kept local to the drawer so
// one failing view never blanks the whole stack. Renders inner body only (the
// persistent DrawerContent supplies the chrome). Mirrors the top-level ErrorFallback
// (molecules/Fallbacks): an Alert, plus a retry since resetErrorBoundary is available.
export function DrawerErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const { t } = useTranslation('common')
  const { t: tEvents } = useTranslation('events')
  const navigate = useAtlasNavigate()

  return (
    <DrawerBody className="flex flex-col items-center justify-center gap-3 py-16">
      <Alert
        align="start"
        className="max-w-xs"
        color="danger"
        description={error?.message ?? t('error.generic')}
      />
      <Button variant="flat" onClick={resetErrorBoundary}>
        {t('error.retry')}
      </Button>
      {/* A dead direct link (e.g. a finished event the CMS no longer serves)
          still offers a way back into live inventory (issue #52). */}
      <Button color="primary" variant="flat" onClick={() => navigate('/search')}>
        {tEvents('display.see_nearby')}
      </Button>
    </DrawerBody>
  )
}

// The generic "no events" state for the region/online drawers when their list
// comes back empty. Unreachable in the running app (a 0-event region 404s, and the
// online roll-up card only links out when there ARE online events), but rendered so
// a directly-typed URL — or a story's empty case — never shows a blank drawer.
// Search has its own filter-aware empty state (DynamicEventsList's EmptyResults).
export function EmptyEventList() {
  const { t } = useTranslation('common')

  return (
    <div className="p-4">
      <Alert color="default" description={t('filters.no_events')} />
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
// rather than the pinpoint zoom it uses for a bare centre. `shouldShowNearbyPrompt`
// (src/lib/nearby.ts, fully unit-tested) owns the visibility conditions; dismissal
// (× or accept) is session-scoped.
export function NearbySuggestion({ regionCenter }: { regionCenter?: [number, number] | null }) {
  const navigate = useAtlasNavigate()
  const [searchParams] = useSearchParams()
  const [dismissed, setDismissed] = useState(readNearbyDismissed)
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
      shouldShowNearbyPrompt({ guess: ipLocation, dismissed, activeSearch, geojson, regionCenter }),
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

    markNearbyDismissed()
    // Also hide it immediately: accepting from /search → /search is a same-pathname
    // nav, so NearbySuggestion doesn't remount to re-read the session flag on its own.
    setDismissed(true)
    navigate(`/search?${params.toString()}`)
  }, [ipLocation, navigate, searchParams])

  const handleDismiss = useCallback(() => {
    markNearbyDismissed()
    setDismissed(true)
  }, [])

  // `!ipLocation` is implied by `!show`, but narrows the type for the render below.
  if (!ipLocation || !show) return null

  return <NearbyPrompt city={ipLocation.city} onAccept={handleSelect} onClose={handleDismiss} />
}
