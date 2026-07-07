import type { FallbackProps } from 'react-error-boundary'
import type { GeocodingFeature } from '@mapbox/search-js-core'
import type { DependencyList } from 'react'

import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useSuspenseQuery } from '@tanstack/react-query'

import { DrawerBody, DrawerClose, DrawerContent, DrawerFooter } from '@/components/atoms/Drawer'
import { Spinner } from '@/components/atoms/Spinner'
import { Alert } from '@/components/atoms/Alert'
import { Button } from '@/components/atoms/Button'
import { CloseIcon } from '@/components/atoms/Icons'
import { Toolbar } from '@/components/molecules/Toolbar'
import { MapSearch } from '@/components/organisms/Mapbox/MapSearch'
import api from '@/config/api'
import { resolvePath } from '@/lib/shape'

// The close affordance for the nested drawers. Wrapped in vaul's DrawerClose so
// activating it closes this drawer; DrawerStack's onOpenChange then navigates to the
// parent route — the same path a swipe-dismiss takes. Sits top-right, the conventional
// drawer/dialog close position, replacing the old custom back button.
export function CloseButton({ className }: { className?: string }) {
  const { t } = useTranslation('common')

  return (
    <DrawerClose>
      <button
        aria-label={t('close')}
        className={`shrink-0 rounded p-1 text-foreground transition-colors hover:bg-primary-3 ${className ?? ''}`}
        type="button"
      >
        <CloseIcon size={22} />
      </button>
    </DrawerClose>
  )
}

// The geocoder search field used by RootView/SearchView headers. Selecting a
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

// Every View frames the map only when it's the top of the stack, via one of
// these `if (isTop) frame...()` effects. Centralizing the shell here keeps the
// six call sites to one line each and their deps arrays honest — `deps` is
// spread into the effect's own array, so it's fine that its length varies
// per view (it's fixed for any given call site across renders).
export function useFrameOnTop(isTop: boolean, frame: () => void, deps: DependencyList) {
  useEffect(() => {
    if (isTop) frame()
  }, [isTop, ...deps])
}

// Every View's drawer footer is the same Toolbar; a one-line shared component
// so that isn't hand-repeated six times.
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

// Suspense fallback for a view whose data is still loading — a drawer panel with a
// spinner, so the drawer's chrome is present while its content resolves. Mirrors
// the top-level LoadingFallback (molecules/Fallbacks) so loading states look the
// same everywhere.
export function DrawerLoading({ ariaLabel }: { ariaLabel: string }) {
  const { t } = useTranslation('common')

  return (
    <DrawerContent ariaLabel={ariaLabel}>
      <DrawerBody className="flex items-center justify-center py-16">
        <Spinner color="secondary" label={t('loading')} />
      </DrawerBody>
    </DrawerContent>
  )
}

// ErrorBoundary fallback for a view whose query failed — kept local to the drawer
// so one failing view never blanks the whole stack. Mirrors the top-level
// ErrorFallback (molecules/Fallbacks): an Alert, not hand-rolled error markup;
// adds a retry action since resetErrorBoundary is only available at this level.
export function DrawerErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const { t } = useTranslation('common')

  return (
    <DrawerContent ariaLabel={t('error.generic')}>
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
    </DrawerContent>
  )
}
