import type { MapSearchProps } from '@/components/organisms/Mapbox/MapSearch'
import type { GeocodingFeature } from '@mapbox/search-js-core'
import type { DependencyList, ReactNode } from 'react'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigationType, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Funnel, Search } from 'lucide-react'
import clsx from 'clsx'

import { Button } from '@/components/atoms/Button'
import { FallbackPanel, GeolocationPrompt } from '@/components/molecules'
import { MapSearch } from '@/components/organisms'
import api, { eventQuery } from '@/config/api'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import embed from '@/config/embed'
import { useCameraHistory, useFilterPanelState } from '@/config/store'
import { useAtlasNavigate } from '@/hooks/use-atlas-navigate'
import { useEventFilters } from '@/hooks/use-filters'
import { useIpLocation } from '@/hooks/use-ip-location'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { approxBounds } from '@/lib/geo'
import { geocodeBounds, geocodeCountryCode } from '@/lib/geocode'
import { countrySite } from '@/lib/country-sites'
import { atlasError } from '@/lib/report'
import {
  NEARBY_RADIUS_KM,
  hasActivePlaceSearch,
  markGeolocationDismissed,
  readGeolocationDismissed,
  shouldShowGeolocationPrompt,
} from '@/lib/geolocation'
import {
  type PlaceSearch,
  type EventFilters,
  activeFilterCount,
  searchPath,
  atlasDepth,
  isoCountryCode,
  placeSearchPath,
  resolvePath,
  topViewKey,
} from '@/lib/shape'

// The collapse/expand and dismiss control for the sheet, provided by DrawerStack.
// Views use it for their close and list-toggle buttons, so those act on the ONE
// persistent vaul sheet directly (a plain navigation), rather than opening or
// closing a drawer — which is what kept the sheet from sliding out and back in on
// every transition.
export type DrawerControl = {
  collapsed: boolean
  canCollapse: boolean
  /**
   * Whether `dismiss()` would actually go somewhere. This is false only at the
   * root, where there is no parent to climb to and `navigate(-1)` would take the
   * HOST page back. It is read by the error/loading chrome, which renders its own
   * header and must not offer a dead control (issue #89). The views' own headers
   * do not need it, since a view that rendered at all has a working stack around
   * it.
   */
  canDismiss: boolean
  toggle: () => void
  dismiss: () => void
  /** Takes a phone's sheet near-full, for typing in the search field. */
  raise: () => void
  /** A class view's measured default height on the phone sheet, or null for the fallback. */
  setOpenHeight: (px: number | null) => void
  /** Lifts a bottom sheet to its near-full height, for content that just grew. */
  expand?: () => void
}

export const DrawerControlContext = createContext<DrawerControl>({
  collapsed: false,
  canCollapse: false,
  canDismiss: false,
  toggle: () => {},
  dismiss: () => {},
  raise: () => {},
  setOpenHeight: () => {},
})

export const useDrawerControl = () => useContext(DrawerControlContext)

export type DrawerTitleProps = {
  /** The drawer's visible heading. */
  title: ReactNode
  /** An optional muted line under it (region subtitle, event date, and similar). */
  subtitle?: ReactNode
  /**
   * A smaller standing note below the subtitle (for example, "All events are
   * free"). Distinct from `subtitle` in rank, not just size: the subtitle says
   * which thing this drawer is about, and the note is a fact that holds for the
   * whole list.
   */
  note?: ReactNode
}

/**
 * The title block every drawer header opens with. This used to be copy-pasted
 * across five views, which let the weight drift (`font-bold` here versus the event
 * panel's `font-semibold`) and left all five as plain `<div>`s — so screen-reader
 * users had no heading to navigate the drawer content by. This renders a real
 * `<h2>`: the dialog itself is named by the sr-only Vaul.Title, so this is the
 * content heading below it, not a competing label.
 */
export function DrawerTitle({ title, subtitle, note }: DrawerTitleProps) {
  return (
    <div className="min-w-0">
      <h2 className="line-clamp-2 text-xl break-words">{title}</h2>
      {subtitle && <div className="truncate text-sm text-gray-11">{subtitle}</div>}
      {note && <div className="truncate text-xs text-gray-11">{note}</div>}
    </div>
  )
}

/**
 * The drawer header's icon controls (back, list-toggle, filter) are all the same
 * Button preset, kept here as values, rather than as a wrapper component, so the
 * three provably render identical chrome — the header reads as one set of buttons.
 */
export const HEADER_CONTROL = { variant: 'ghost', isIconOnly: true, size: 'sm' } as const

// The last control in a header. Its 20px icon sits in a 32px box, so this pulls the box 6px
// into the gutter. The icon then lands on the panel's 16px edge, in the same column as the
// rows' chevrons, while the tap area stays whole.
const HEADER_LAST_CONTROL = '-me-1.5'

// The search affordance for region headers (RegionView): jumps to the
// distance-ranked search view. This renders the same header-control chrome as the
// other header controls, so the header reads as one set of buttons.
export function SearchButton() {
  // `useSuspense: false` — also rendered by the fallback chrome
  // (views/fallbacks.tsx), where suspending on an in-flight namespace would
  // escape the boundary and blank the widget instead of showing the failure.
  const { t } = useTranslation()
  const navigate = useAtlasNavigate()

  return (
    <Button
      {...HEADER_CONTROL}
      aria-label={t('search.chrome.title')}
      onClick={() => navigate(searchPath())}
    >
      <Search size={20} />
    </Button>
  )
}

// A sheet pulled down to its peek says how to bring it back. The handle does this too, but
// a thin handle is easy to miss, and a keyboard can't use it. `label` is for the views where
// what comes back is not a list.
export function ExpandSheetButton({ label }: { label?: string }) {
  // Also rendered by the error/loading chrome, so it must not suspend.
  const { t } = useTranslation()
  const { collapsed, canCollapse, toggle } = useDrawerControl()

  if (!canCollapse || !collapsed) return null

  return (
    <Button className="shrink-0" color="primary" size="sm" variant="flat" onClick={toggle}>
      {label ?? t('common.chrome.show_list')}
    </Button>
  )
}

// The event-filters trigger that opens the filter drawer by navigating to
// `<current>/filters` (root to `/filters`, `/search` to `/search/filters`),
// preserving the search query so closing returns to the same search. Two shapes
// over one nav plus count: the labeled ghost button for the list toolbar
// (SearchView), and — with `iconOnly` — an icon-only header control carrying the
// active count as a badge (CountriesView's header), so it reads as one set with
// the close/collapse chrome.
// How this layout offers filters beside the list, if it has room: a panel the Filters button
// toggles, or chips that are always there, so no button at all. `null` means behind the button,
// in the filter drawer. DrawerStack owns the measurement.
export const FilterPanelAvailableContext = createContext<'panel' | 'chips' | null>(null)

export function FilterButton({
  iconOnly = false,
  isLast = false,
  counted,
}: {
  iconOnly?: boolean
  /** Nothing follows it in the header, so its icon takes the panel's right edge. */
  isLast?: boolean
  /** The filters the badge counts, when a view shows some of them another way. */
  counted?: EventFilters
}) {
  // `useSuspense: false` — also rendered by the fallback chrome
  // (views/fallbacks.tsx), where suspending on an in-flight namespace would
  // escape the boundary and blank the widget instead of showing the failure.
  const { t } = useTranslation()
  const navigate = useAtlasNavigate()
  const location = useLocation()
  const applied = useEventFilters()
  const count = activeFilterCount(counted ?? applied)

  const label = count > 0 ? `${t('filters.chrome.title')} (${count})` : t('filters.chrome.title')
  const to = `${location.pathname === '/' ? '' : location.pathname}/filters`
  const panelAvailable = useContext(FilterPanelAvailableContext)
  const panelOpen = useFilterPanelState((s) => s.open)
  const setPanelOpen = useFilterPanelState((s) => s.setOpen)
  const open = () =>
    panelAvailable ? setPanelOpen(!panelOpen) : navigate({ pathname: to, search: location.search })

  if (panelAvailable === 'chips' || !embed.config.filters) return null

  if (iconOnly) {
    return (
      <Button
        {...HEADER_CONTROL}
        aria-label={label}
        className={clsx('relative', isLast && HEADER_LAST_CONTROL)}
        onClick={open}
      >
        <Funnel size={20} />
        {count > 0 && (
          <span
            aria-hidden
            className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-9 px-1 text-xs leading-none font-semibold text-primary-foreground"
          >
            {count}
          </span>
        )}
      </Button>
    )
  }

  return (
    // The font turns "(2)" into a tiny circled figure unless its ligatures are off.
    <Button className="[font-variant-ligatures:none]" size="sm" variant="ghost" onClick={open}>
      <Funnel size={18} />
      {label}
    </Button>
  )
}

// The geocoder search field used by CountriesView/SearchView headers. Selecting a
// place navigates to /search with the geocoded bbox and centre (the SearchView
// ranks events by distance from there). This carries the geocode-to-search
// behaviour that used to live in the removed SearchBar.
export function SearchField({
  label,
  seedFromUrl,
  onPlace,
}: Pick<MapSearchProps, 'label' | 'seedFromUrl'> & {
  /** Handle the picked place here, instead of opening the search route. */
  onPlace?: (place: PlaceSearch) => void
} = {}) {
  const navigate = useAtlasNavigate()
  const [searchParams] = useSearchParams()
  const { raise } = useDrawerControl()

  const handleSelect = useCallback(
    (value: GeocodingFeature) => {
      const place: PlaceSearch = {
        q: value.properties.full_address ?? '',
        center: [value.properties.coordinates.longitude, value.properties.coordinates.latitude],
        bbox: geocodeBounds(value),
        // The country the place sits in, so an empty result set can offer
        // that country's own site (issue #82). Present for a country-level
        // result and for a town within one. It is absent for an ocean or a
        // country-less feature.
        countryCode: geocodeCountryCode(value),
      }

      if (onPlace) onPlace(place)
      // `placeSearchPath` carries the active filters and sort across and
      // resets the searched location — one builder shared with the IP
      // suggestion and the geolocate control, so none of the three can
      // forget half of it.
      else navigate(placeSearchPath(searchParams, place))
    },
    [navigate, searchParams, onPlace],
  )

  return (
    // Focus raises a phone's sheet, so the suggestions (and the keyboard) have room.
    <div className="min-w-0 flex-1" onFocus={raise}>
      <MapSearch label={label} seedFromUrl={seedFromUrl} onSelect={handleSelect} />
    </div>
  )
}

// Context handed to a top view's frame callback. `isEntry` is true when the view
// is the session entry point (a fresh deep link or structural climb — depth 0),
// rather than an in-session push. A placeless view (OnlineView) frames its parent
// only then, so it never needs to re-derive history-awareness itself.
export type FrameContext = { isEntry: boolean }

// Only the top (active) view is rendered — ancestors are peek panels, not views —
// so each view frames the map for its level unconditionally on mount, and when
// its inputs change. This is centralized, so the call sites are one line and their
// deps arrays stay honest: `deps` is spread into the effect's own array, so a
// per-view length is fine (it is fixed for any given call site across renders).
export function useFrameOnTop(frame: (ctx: FrameContext) => void, deps: DependencyList) {
  const location = useLocation()
  const navigationType = useNavigationType()
  const { hasMap, restore } = useMapController()
  // Which view the base drawer is showing NOW, checked against the one this hook
  // belongs to. This is a ref, because the latter is this view's identity, fixed
  // for its lifetime — recomputing it would only ever compare the live value
  // with itself.
  const activeView = topViewKey(location.pathname, hasMap)
  const ownView = useRef(activeView)

  useEffect(() => {
    // An EXITING view does not own the camera. DrawerStack keeps it mounted for
    // its 150ms exit, and router context still reaches it, so a view whose deps
    // come from the URL re-renders under the NEXT route and re-runs this effect
    // for a level it no longer shows. That is how tapping a pin from a search
    // used to reset the camera to the world a beat before the event framed. A
    // visitor read that as a zoom-out followed by a long fly back in. See
    // `topViewKey` for why this is not a `location.pathname` comparison, and why
    // it must not be "did the location change" (a re-search moves `?center` and
    // legitimately re-frames the SAME view).
    if (activeView !== ownView.current) return

    // On a POP back to a remembered entry, this restores the camera the user
    // left, rather than re-deriving the framing — so closing an event returns to
    // the prior viewport/zoom (browser back/forward get this for free).
    // Otherwise (a PUSH, or a fresh deep link with no snapshot) it frames
    // normally, telling the view whether it is the session entry point. `deps`
    // is the caller's own list. `location`, navigationType, hasMap, and restore
    // stay stable for a mounted view.
    const snapshot =
      navigationType === 'POP' ? useCameraHistory.getState().read(location.key) : undefined

    if (hasMap && snapshot) restore(snapshot)
    else frame({ isEntry: atlasDepth(location) === 0 })
  }, [...deps])
}

// RegistrationView and ShareView both resolve an event from its route path, and suspense-fetch
// it. This is shared here, so the resolvePath-plus-queryKey convention stays in one place.
// EventView, one level up in the stack, already fetches the same event. TanStack Query's
// `['event', id, locale]` cache serves this call from that fetch, not a fresh network round
// trip. `resolveStack` derives `eventPath` from the raw preceding URL segment, without checking
// that it is actually an event. A hand-typed `/india/register` would otherwise reach here as a
// region path. So this bails out before firing a request for a non-existent `NaN` id. The
// nearest ErrorBoundary (DrawerErrorFallback) renders the not-found state instead.
export function useEventFromPath(eventPath: string) {
  const { locale } = useLocale()
  const resolved = resolvePath(eventPath)

  if (resolved?.kind !== 'event') {
    throw atlasError('not-found', `Not an event: ${eventPath}`)
  }

  return useSuspenseQuery(eventQuery(resolved.id, locale))
}

/**
 * The "no events" state for the region/online drawers when their list comes back
 * empty: a region whose events have all ended, or an online roll-up reached by a
 * hand-typed URL.
 *
 * This is the SAME component a dead link renders, on the `empty` row of the same
 * table (issue #89), so it gets the same way out: the nearest ancestor that does
 * list classes, then a field to name somewhere else. The ladder reads the URL's
 * ancestry, so a 0-event Antwerpen offers Belgium, rather than offering itself
 * back.
 *
 * Search keeps its own filter-aware empty states, which have better reasons
 * available (DynamicEventsList's EmptyResults) — but renders them through this
 * same panel.
 */
export function EmptyEventList() {
  // `useSuspense: false` — also rendered by the fallback chrome
  // (views/fallbacks.tsx), where suspending on an in-flight namespace would
  // escape the boundary and blank the widget instead of showing the failure.
  const { t } = useTranslation()

  return (
    // `align="start"`: this stands in for the region's list, which begins at the
    // top-left of the body — the same posture `fallbackAlign` gives these
    // views' error states.
    <FallbackPanel align="start" kind="empty">
      {/* `label` is the field's accessible name AND its placeholder, so it does the whole
          job of prompting: dropped out of a header, the default "search for events near…"
          reads on this screen as a promise that there ARE nearby events. */}
      <SearchField
        label={t('common.errors.search_label', { defaultValue: 'Or search for a place' })}
      />
    </FallbackPanel>
  )
}

// The single shared wiring for the IP-geolocation nearby suggestion, rendered above the list
// on CountriesView, RegionView, and SearchView, so the behaviour is not triplicated. This reads
// the passive IP location — one lookup per session, which fails silently, so nothing renders —
// and, on accept, navigates into the distance-ranked search centred on the guess. It preserves
// the active URL filters exactly as SearchField does, plus a synthesized city-sized bbox, so
// SearchView frames a neighbourhood rather than the pinpoint zoom it uses for a bare centre.
// `shouldShowGeolocationPrompt` (src/lib/geolocation.ts, fully unit-tested) owns the visibility
// conditions. Only the close button persists a session-scoped dismissal. Accepting merely
// navigates. The prompt self-hides while the visitor views that area, but returns once they
// leave it.
export function useIpSuggestion(region?: {
  center?: [number, number] | null
  countryCode?: string | null
}) {
  const navigate = useAtlasNavigate()
  const [searchParams] = useSearchParams()
  const [dismissed, setDismissed] = useState(readGeolocationDismissed)
  // Skips the passive lookup when it could not be shown anyway — dismissed, or a
  // place search is already active — so those cases never ping the third-party
  // service.
  const activeSearch = hasActivePlaceSearch(searchParams)
  const ipLocation = useIpLocation(!dismissed && !activeSearch)

  // The cached event feed powers the "is anything actually near?" guard.
  const { data: geojson } = useQuery({
    queryKey: ['geojson'],
    queryFn: () => api.getGeojson(),
    staleTime: GEOJSON_STALE_TIME,
  })

  // Beside the filter panel's Near me, a second "near you" offer is one location control too many.
  const filterPanelUp = useFilterPanelState((s) => s.onScreen)
  const show = useMemo(
    () =>
      !filterPanelUp &&
      shouldShowGeolocationPrompt({
        guess: ipLocation,
        dismissed,
        activeSearch,
        geojson,
        regionCenter: region?.center,
        viewedCountry: region?.countryCode,
      }),
    [
      filterPanelUp,
      ipLocation,
      dismissed,
      activeSearch,
      geojson,
      region?.center,
      region?.countryCode,
    ],
  )

  const accept = useCallback(() => {
    if (!ipLocation) return

    // Accepting must NOT persist a dismissal — only the close button does (dismiss).
    // Zooming to the guess already hides the prompt on its own. The new URL carries
    // `?center`/`?q`, so `hasActivePlaceSearch` suppresses it while the visitor is looking at
    // that area. Leaving the area, by clearing the search, brings the suggestion back, so it
    // keeps offering until the visitor actually dismisses it.
    navigate(
      placeSearchPath(searchParams, {
        q: `${ipLocation.city}, ${ipLocation.country}`,
        center: [ipLocation.longitude, ipLocation.latitude],
        // A synthesized city-sized box, so the search frames a neighbourhood
        // rather than the pinpoint zoom a bare centre gets. The device fix
        // uses the same floor — see `nearbyBounds`, which additionally
        // extends to the classes themselves, because there the point is
        // precise enough for that to mean something.
        bbox: approxBounds([ipLocation.longitude, ipLocation.latitude], NEARBY_RADIUS_KM),
        // The same searched-country marker SearchField writes — the guess
        // already carries the code (it also orders an event's share
        // targets), so an accepted suggestion that lands in a program-less
        // country gets the offer too.
        countryCode: isoCountryCode(ipLocation.country_code),
      }),
    )
  }, [ipLocation, navigate, searchParams])

  const dismiss = useCallback(() => {
    markGeolocationDismissed()
    setDismissed(true)
  }, [])

  // `!ipLocation` is implied by `!show`, but narrows the type for callers.
  return ipLocation && show ? { guess: ipLocation, accept, dismiss } : null
}

/**
 * The banner, for a country other than the guess. (The world view offers the guess in its near-me
 * row instead.) The lookup can land seconds after the list has painted, and a banner pushed in above
 * rows the visitor may be about to tap makes them tap the wrong one (seen at about 8s on iOS). So a
 * view mounts this twice: `above` shows only if the answer was already known at the first paint,
 * `below` only if it came later, where it moves nothing.
 */
export function GeolocationSuggestion({
  region,
  position,
}: {
  region: { center?: [number, number] | null; countryCode?: string | null }
  position: 'above' | 'below'
}) {
  const suggestion = useIpSuggestion(region)
  const { regionNames } = useLocale()
  const knownAtFirstPaint = useRef(suggestion !== null)

  if (!suggestion || knownAtFirstPaint.current !== (position === 'above')) return null

  const code = isoCountryCode(suggestion.guess.country_code)
  const site = countrySite(code)

  return (
    <div className={position === 'below' ? 'pt-3' : undefined}>
      <GeolocationPrompt
        city={suggestion.guess.city}
        site={code && site ? { href: site, country: regionNames.of(code) ?? code } : undefined}
        onAccept={suggestion.accept}
        onClose={suggestion.dismiss}
      />
    </div>
  )
}
