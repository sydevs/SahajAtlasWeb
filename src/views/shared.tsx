import type { FallbackProps } from 'react-error-boundary'
import type { GeocodingFeature } from '@mapbox/search-js-core'
import type { DependencyList } from 'react'

import { createContext, useCallback, useContext, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useSuspenseQuery } from '@tanstack/react-query'

import { DrawerBody, DrawerFooter } from '@/components/atoms/Drawer'
import { Spinner } from '@/components/atoms/Spinner'
import { Alert } from '@/components/atoms/Alert'
import { Button } from '@/components/atoms/Button'
import { CloseIcon, ListIcon } from '@/components/atoms/Icons'
import { Toolbar } from '@/components/molecules/Toolbar'
import { MapSearch } from '@/components/organisms/Mapbox/MapSearch'
import api from '@/config/api'
import { resolvePath } from '@/lib/shape'

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
    <button
      aria-label={t('close')}
      className={`shrink-0 rounded p-1 text-foreground transition-colors hover:bg-primary-3 ${className ?? ''}`}
      type="button"
      onClick={dismiss}
    >
      <CloseIcon size={22} />
    </button>
  )
}

// The stacked-list toggle in CountriesView's header: expands the collapsed peek into
// the country list, or collapses the open list back to the peek. Hidden where the
// sheet can't collapse (desktop / map-less).
export function CollapseToggle() {
  const { t } = useTranslation('common')
  const { collapsed, canCollapse, toggle } = useDrawerControl()

  if (!canCollapse) return null

  return (
    <button
      aria-expanded={!collapsed}
      aria-label={t('explore')}
      className="shrink-0 rounded p-1 text-foreground transition-colors hover:bg-primary-3"
      type="button"
      onClick={toggle}
    >
      <ListIcon size={24} />
    </button>
  )
}

// The geocoder search field used by CountriesView/SearchView headers. Selecting a
// place navigates to /search with the geocoded bbox + centre (the SearchView
// ranks events by distance from there). Carries the geocode→search behaviour that
// used to live in the removed SearchBar.
export function SearchField() {
  const navigate = useNavigate()

  const handleSelect = useCallback(
    (value: GeocodingFeature) => {
      const params = new URLSearchParams()

      params.set('q', value.properties.full_address ?? '')
      if (value.properties.bbox) params.set('bbox', value.properties.bbox.toString())
      params.set(
        'center',
        `${value.properties.coordinates.longitude},${value.properties.coordinates.latitude}`,
      )
      navigate(`/search?${params.toString()}`)
    },
    [navigate],
  )

  return (
    <div className="min-w-0 flex-1">
      <MapSearch onSelect={handleSelect} />
    </div>
  )
}

// Each view frames the map only when it's the top of the stack, via one of these
// `if (isTop) frame...()` effects. Centralizing the shell keeps the call sites to one
// line each and their deps arrays honest — `deps` is spread into the effect's own
// array, so it's fine that its length varies per view (it's fixed for any given call
// site across renders).
export function useFrameOnTop(isTop: boolean, frame: () => void, deps: DependencyList) {
  useEffect(() => {
    if (isTop) frame()
  }, [isTop, ...deps])
}

// Every View's drawer footer is the same Toolbar; a one-line shared component so
// that isn't hand-repeated across the views.
export function ViewFooter() {
  return (
    <DrawerFooter>
      <Toolbar />
    </DrawerFooter>
  )
}

// RegistrationView and ShareView both resolve an event from its route path and
// suspense-fetch it — shared here so the resolvePath + queryKey convention stays
// in one place. (EventView, one level up in the stack, already fetches the same
// event; TanStack Query's `['event', id]` cache serves this call from that
// fetch, not a fresh network round trip.) `resolveStack` derives `eventPath` from
// the raw preceding URL segment without checking it's actually an event — a
// hand-typed `/india/register` would otherwise reach here as a region path — so
// bail out before firing a request for a non-existent `NaN` id; the nearest
// ErrorBoundary (DrawerErrorFallback) renders the not-found state instead.
export function useEventFromPath(eventPath: string) {
  const resolved = resolvePath(eventPath)

  if (resolved?.kind !== 'event') {
    throw new Error(`Not an event: ${eventPath}`)
  }

  return useSuspenseQuery({
    queryKey: ['event', resolved.id],
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

  return (
    <DrawerBody className="flex flex-col items-center justify-center gap-3 py-16">
      <Alert
        className="max-w-xs"
        color="danger"
        description={error?.message ?? t('error.generic')}
      />
      <Button variant="flat" onClick={resetErrorBoundary}>
        {t('error.retry')}
      </Button>
    </DrawerBody>
  )
}
