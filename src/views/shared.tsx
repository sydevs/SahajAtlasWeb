import type { FallbackProps } from 'react-error-boundary'
import type { GeocodingFeature } from '@mapbox/search-js-core'

import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerContent } from '@/components/atoms/Drawer'
import { Spinner } from '@/components/atoms/Spinner'
import { Button } from '@/components/atoms/Button'
import { UpArrowIcon } from '@/components/atoms/Icons'
import { MapSearch } from '@/components/organisms/Mapbox/MapSearch'

// A back/close affordance that navigates to a parent route — how the desktop-left
// drawers (which have no swipe-to-dismiss) go up the stack.
export function BackButton({ to, className }: { to: string; className?: string }) {
  const navigate = useNavigate()
  const { t } = useTranslation('common')

  return (
    <button
      aria-label={t('back')}
      className={`shrink-0 rounded p-1 text-foreground transition-colors hover:bg-primary-3 ${className ?? ''}`}
      type="button"
      onClick={() => navigate(to)}
    >
      <UpArrowIcon size={28} />
    </button>
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

  return <MapSearch onSelect={handleSelect} />
}

// Suspense fallback for a view whose data is still loading — a drawer panel with a
// spinner, so the drawer's chrome is present while its content resolves.
export function DrawerLoading({ ariaLabel }: { ariaLabel: string }) {
  return (
    <DrawerContent ariaLabel={ariaLabel}>
      <DrawerBody className="flex items-center justify-center py-16">
        <Spinner />
      </DrawerBody>
    </DrawerContent>
  )
}

// ErrorBoundary fallback for a view whose query failed — kept local to the drawer
// so one failing view never blanks the whole stack.
export function DrawerErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const { t } = useTranslation('common')

  return (
    <DrawerContent ariaLabel="Error">
      <DrawerBody className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-sm text-gray-11">{error?.message ?? t('error.generic')}</p>
        <Button variant="flat" onClick={resetErrorBoundary}>
          {t('error.retry')}
        </Button>
      </DrawerBody>
    </DrawerContent>
  )
}
