import React, { Component, type ReactNode } from 'react'
import { Geocoder } from '@mapbox/search-js-react'
import { GeocodingFeature } from '@mapbox/search-js-core'
import { useTranslation } from 'react-i18next'

import { hoistGeocoderLiveRegion } from './aria-live'
import { controlTheme } from './themes'

import { useLocale } from '@/hooks/use-locale'
import { useMapbox } from '@/hooks/use-mapbox'

export interface MapSearchProps {
  /** Called with the geocoded place the user picked from the suggestions. */
  onSelect: (value: GeocodingFeature) => void
  /** The field's text. Its owner decides where that lives — a form draft, or `?q`. */
  value: string
  onChange: (text: string) => void
  /**
   * This is the accessible name and placeholder. It defaults to the "search
   * for events near…" phrasing, which is right in a header, where position
   * already says what the field is for. But it reads as a promise of nearby
   * events when the field sits in an error body instead.
   */
  label?: string
  /**
   * Restricts suggestions to these Geocoding feature types, comma-separated — `place` for an
   * online class's city, `address` for a venue (#147). Every type is offered when omitted.
   */
  types?: string
  /**
   * Biases suggestions toward this point rather than the map's centre — the region an
   * add-a-class flow opened from, which a map-less embed has no camera to say.
   */
  proximity?: { lng: number; lat: number }
}

// The geocoder is a custom element from @mapbox/search-js-web. It fails to
// mount where its element definition is not in the current document's
// registry. This happens most notably inside an iframe that never received
// the definition (Ladle's width and preview frames), where its mount effect
// throws "node.bindMap is not a function." It can also happen under a
// restrictive host CSP. Rather than let that failure crash the whole widget
// through the nearest error boundary, this boundary contains it and renders
// a plain text field instead. In production — same-document registry, valid
// token — the real geocoder always mounts, so this never triggers.
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

/**
 * The geocoder field itself, and nothing else: it renders what it is given and reports what was
 * picked. Where the text lives is its owner's question — `SearchField` keeps it in `?q`, the
 * add-a-class Where step keeps it beside the draft.
 */
export function MapSearch({ onSelect, value, onChange, label, types, proximity }: MapSearchProps) {
  const { mapbox } = useMapbox()
  const { locale } = useLocale()
  const { t } = useTranslation()
  const fieldLabel = label ?? t('search.chrome.placeholder')
  const field = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const scope = field.current

    return scope ? hoistGeocoderLiveRegion(scope) : undefined
  }, [])

  return (
    // The Geocoder permanently reserves ~40px of right padding for its
    // "action" slot. The only thing that ever occupies it is the Clear (×)
    // button, which Mapbox itself hides (`display: none`) while the field is
    // empty. This returns that space to the placeholder whenever the field
    // is empty. `:placeholder-shown` stops matching the moment the user
    // types and the × appears, so the text never runs under it. (The
    // generated `mbx…--Input` class carries a per-build hash, so this
    // targets the element, not the class.)
    <div ref={field} className="[&_input:placeholder-shown]:!pe-3">
      <GeocoderBoundary
        fallback={
          <input
            aria-label={fieldLabel}
            className="w-full rounded-lg border border-divider bg-gray-2 px-3 py-2 text-sm text-foreground placeholder:text-gray-11"
            placeholder={fieldLabel}
            type="search"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        }
      >
        {/* @ts-ignore: 'Geocoder' cannot be used as a JSX component. */}
        <Geocoder
          accessToken={import.meta.env.VITE_MAPBOX_ACCESSTOKEN}
          // @ts-ignore: Type 'Map$1' is not assignable to type 'Map'.
          map={mapbox?.getMap()}
          options={{
            language: locale, // TODO: Make sure this switches when locale changes
            proximity: proximity ?? mapbox?.getCenter(),
            ...(types ? { types } : {}),
          }}
          placeholder={fieldLabel}
          theme={controlTheme}
          value={value}
          onChange={onChange}
          onRetrieve={onSelect}
        />
      </GeocoderBoundary>
    </div>
  )
}
