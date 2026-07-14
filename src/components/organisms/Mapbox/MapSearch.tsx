import React from 'react'
import { Geocoder } from '@mapbox/search-js-react'
import { GeocodingFeature } from '@mapbox/search-js-core'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'

import { controlTheme } from './themes'

import { useLocale } from '@/hooks/use-locale'
import { useMapbox } from '@/hooks/use-mapbox'

interface SearchProps {
  onSelect: (value: GeocodingFeature) => void
}

export function MapSearch({ onSelect }: SearchProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = React.useState(searchParams.get('q') || '')
  const { mapbox } = useMapbox()
  const { locale } = useLocale()
  const { t } = useTranslation('common')

  return (
    // @ts-ignore: 'Geocoder' cannot be used as a JSX component.
    <Geocoder
      accessToken={import.meta.env.VITE_MAPBOX_ACCESSTOKEN}
      // @ts-ignore: Type 'Map$1' is not assignable to type 'Map'.
      map={mapbox?.getMap()}
      options={{
        language: locale, // TOOD: Make sure this switches when locale changes
        proximity: mapbox?.getCenter(),
      }}
      placeholder={t('search_placeholder')}
      theme={controlTheme}
      value={searchQuery}
      onChange={(query) => {
        setSearchQuery(query)
        // Merge `q` into the existing query so the active filters (and bbox/center)
        // survive typing — they live only in the URL now. `replace` so per-keystroke
        // edits don't stack history.
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev)

            next.set('q', query)

            return next
          },
          { replace: true },
        )
      }}
      onRetrieve={onSelect}
    />
  )
}
