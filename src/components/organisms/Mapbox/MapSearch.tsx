import React, { Component, type ReactNode } from 'react'
import { Geocoder } from '@mapbox/search-js-react'
import { GeocodingFeature } from '@mapbox/search-js-core'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'

import { controlTheme } from './themes'

import { useLocale } from '@/hooks/use-locale'
import { useMapbox } from '@/hooks/use-mapbox'

export interface MapSearchProps {
  /** Called with the geocoded place the user picked from the suggestions. */
  onSelect: (value: GeocodingFeature) => void
}

// The geocoder is a custom element from @mapbox/search-js-web. It fails to mount
// where its element definition isn't in the current document's registry — most
// notably inside an iframe that never received the definition (Ladle's width /
// preview frames), where its mount effect throws "node.bindMap is not a function",
// and in principle under a restrictive host CSP. Rather than let that tear the
// whole widget down through the nearest error boundary, contain it here and fall
// back to a plain text field. In production (same-document registry, valid token)
// the real geocoder always mounts, so this never triggers.
class GeocoderBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export function MapSearch({ onSelect }: MapSearchProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = React.useState(searchParams.get('q') || '')
  const { mapbox } = useMapbox()
  const { locale } = useLocale()
  const { t } = useTranslation('common')

  // Merge `q` into the existing query so the active filters (and bbox/center)
  // survive typing — they live only in the URL now. `replace` so per-keystroke
  // edits don't stack history. Shared by the geocoder and the plain fallback.
  const setQuery = (query: string) => {
    setSearchQuery(query)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)

        next.set('q', query)

        return next
      },
      { replace: true },
    )
  }

  return (
    // The Geocoder permanently reserves ~40px of right padding for its "action"
    // slot, but the only thing that ever occupies it is the Clear (×) button —
    // which Mapbox itself hides (`display: none`) while the field is empty. Give
    // that space back to the placeholder whenever the field is empty;
    // `:placeholder-shown` stops matching the moment the user types and the ×
    // appears, so the text never runs under it. (The generated `mbx…--Input`
    // class carries a per-build hash, so this targets the element, not the class.)
    <div className="[&_input:placeholder-shown]:!pe-3">
      <GeocoderBoundary
        fallback={
          <input
            aria-label={t('search_placeholder')}
            className="w-full rounded-lg border border-divider bg-gray-2 px-3 py-2 text-sm text-foreground placeholder:text-gray-11"
            placeholder={t('search_placeholder')}
            type="search"
            value={searchQuery}
            onChange={(event) => setQuery(event.target.value)}
          />
        }
      >
        {/* @ts-ignore: 'Geocoder' cannot be used as a JSX component. */}
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
          onChange={setQuery}
          onRetrieve={onSelect}
        />
      </GeocoderBoundary>
    </div>
  )
}
