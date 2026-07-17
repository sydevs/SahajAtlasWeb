import type { FallbackProps } from 'react-error-boundary'
import type { GeocodingFeature } from '@mapbox/search-js-core'
import type { DependencyList } from 'react'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'

import { DrawerBody } from '@/components/atoms/Drawer'
import { Spinner } from '@/components/atoms/Spinner'
import { Alert } from '@/components/atoms/Alert'
import { Button, IconButton } from '@/components/atoms/Button'
import { Chip } from '@/components/atoms/Chip'
import { Link } from '@/components/atoms/Link'
import { CloseIcon, FilterIcon, ListIcon } from '@/components/atoms/Icons'
import { NearbyPrompt } from '@/components/molecules'
import { MapSearch } from '@/components/organisms/Mapbox/MapSearch'
import api from '@/config/api'
import { useWidgetMode } from '@/config/mode'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import { useEventDisplay } from '@/hooks/use-event-display'
import { useEventFilters } from '@/hooks/use-filters'
import { useIpLocation } from '@/hooks/use-ip-location'
import { useLocale } from '@/hooks/use-locale'
import { approxBounds } from '@/lib/geo'
import { Event } from '@/types'
import {
  hasActivePlaceSearch,
  markNearbyDismissed,
  readNearbyDismissed,
  shouldShowNearbyPrompt,
} from '@/lib/nearby'
import { activeFilterCount, filtersFromParams, filtersToParams, resolvePath } from '@/lib/shape'

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
export function CloseButton({ className }: { className?: string }) {
  const { t } = useTranslation('common')
  const { dismiss } = useDrawerControl()

  return (
    <IconButton aria-label={t('close')} className={className} onClick={dismiss}>
      <CloseIcon size={20} />
    </IconButton>
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
    <IconButton
      aria-expanded={!collapsed}
      aria-label={collapsed ? t('explore') : t('close')}
      onClick={toggle}
    >
      {collapsed ? <ListIcon size={24} /> : <CloseIcon size={20} />}
    </IconButton>
  )
}

// The event-filters trigger in CountriesView/SearchView headers: opens the filter
// drawer by navigating to `<current>/filters` (root → `/filters`, `/search` →
// `/search/filters`), preserving the search query so closing returns to the same
// search. Shows an active-filter count badge; renders the same IconButton chrome as
// the close/list controls so the header reads as one set of buttons.
export function FilterButton() {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const location = useLocation()
  const count = activeFilterCount(useEventFilters())

  const label = count > 0 ? `${t('filters.title')} (${count})` : t('filters.title')
  const to = `${location.pathname === '/' ? '' : location.pathname}/filters`

  return (
    <IconButton
      aria-label={label}
      className="relative"
      onClick={() => navigate({ pathname: to, search: location.search })}
    >
      <FilterIcon size={20} />
      {count > 0 && (
        <span
          aria-hidden
          className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-9 px-1 text-[10px] font-semibold leading-none text-primary-foreground"
        >
          {count}
        </span>
      )}
    </IconButton>
  )
}

// The geocoder search field used by CountriesView/SearchView headers. Selecting a
// place navigates to /search with the geocoded bbox + centre (the SearchView
// ranks events by distance from there). Carries the geocode→search behaviour that
// used to live in the removed SearchBar.
export function SearchField() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const handleSelect = useCallback(
    (value: GeocodingFeature) => {
      // Preserve the active filters (URL-only now) while resetting the searched
      // location — searching a new place shouldn't silently clear the filters.
      const params = filtersToParams(filtersFromParams(searchParams))

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

// Only the top (active) view is rendered — ancestors are peek panels, not views — so
// each view frames the map for its level unconditionally on mount / when its inputs
// change. Centralized so the call sites are one line and their deps arrays stay honest:
// `deps` is spread into the effect's own array, so a per-view length is fine (it's
// fixed for any given call site across renders).
export function useFrameOnTop(frame: () => void, deps: DependencyList) {
  useEffect(() => {
    frame()
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

/**
 * The compact event summary repeated on the registration + share drawers:
 * title · key chips (type · Free · status) · one-line when · one-line where —
 * the same resolver strings as every other surface (issue #52). In an embed
 * (map-less, non-standalone) no Atlas chrome exists around the drawer, so the
 * summary is self-sufficient and carries a small "on Sahaj Atlas" backlink.
 * A view sub-component, deliberately not a design-system export.
 */
export function EventSummary({ event }: { event: Event }) {
  const { t } = useTranslation('events')
  const { standalone, hasMap } = useWidgetMode()
  const { typeLabel, statusChip, whenLine, timeRange, timeHint, whereLine } = useEventDisplay(event)

  const embedded = !standalone && !hasMap
  const when = [whenLine, [timeRange, timeHint].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="mx-auto mb-4 w-full max-w-md border-b border-divider pb-4">
      <div className="text-lg font-semibold leading-tight">{event.title}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <Chip color="default" size="sm">
          {typeLabel}
        </Chip>
        <Chip color="primary" size="sm">
          {t('display.chip_free')}
        </Chip>
        {statusChip && (
          <Chip color="secondary" size="sm">
            {statusChip}
          </Chip>
        )}
      </div>
      <div className="mt-1 text-sm text-gray-11">{when}</div>
      {whereLine && <div className="mt-0.5 text-sm text-gray-11">{whereLine}</div>}
      {embedded &&
        (event.webUrl ? (
          <Link
            className="mt-1 text-xs text-primary-11"
            href={event.webUrl}
            isExternal={true}
            rel="noreferrer noopener"
            target="_blank"
          >
            {t('display.on_sahaj_atlas')}
          </Link>
        ) : (
          <div className="mt-1 text-xs text-gray-11">{t('display.on_sahaj_atlas')}</div>
        ))}
    </div>
  )
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
      <Link className="text-sm font-medium text-primary-11" href="/search">
        {tEvents('display.see_nearby')}
      </Link>
    </DrawerBody>
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
  const navigate = useNavigate()
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

    // Preserve the active filters (URL-only) while resetting the searched location —
    // mirrors SearchField; searching shouldn't silently clear the filters.
    const params = filtersToParams(filtersFromParams(searchParams))

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

  return <NearbyPrompt city={ipLocation.city} onDismiss={handleDismiss} onSelect={handleSelect} />
}
