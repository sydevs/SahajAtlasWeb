import React, { Component, type ReactNode } from 'react'
import { Geocoder } from '@mapbox/search-js-react'
import { type GeocodingResponse, GeocodingFeature, type LngLatLike } from '@mapbox/search-js-core'
import { useLocation, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { hoistGeocoderLiveRegion } from './aria-live'
import { controlTheme } from './themes'

import { clientQuery } from '@/config/api'
import { useBrowsedCountry } from '@/config/store'
import atlasAuth from '@/config/api/auth'
import { useLocale } from '@/hooks/use-locale'
import { useMapbox } from '@/hooks/use-mapbox'
import {
  type ReleasedScope,
  SEARCH_COUNTRY_PARAM,
  isoCountryCode,
  searchCountryScope,
} from '@/lib/shape'

/**
 * The place search field. What is typed stays in the field: the URL changes only when a place is
 * picked (`onSelect`), never per keystroke. Half-typed text in `?q` renamed everything that reads
 * it, so every result card said "5.1 km from Prag" over London's classes.
 */
export interface MapSearchProps {
  /** Called with the geocoded place the user picked from the suggestions. */
  onSelect: (value: GeocodingFeature) => void
  /**
   * This is the accessible name and placeholder. It defaults to the "search
   * for events near…" phrasing, which is right in a header, where position
   * already says what the field is for. But it reads as a promise of nearby
   * events when the field sits in an error body instead.
   */
  label?: string
  /**
   * Ask Mapbox for a result that may be stored. Its terms allow keeping an id
   * only when the lookup that produced it carried this, and such lookups bill
   * separately — so only a mount whose answer is submitted to SahajCloud sets
   * it. Plain browsing stays temporary.
   */
  permanent?: boolean
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

// Places a visitor would name, not bare streets or house numbers. A street name matches hundreds of
// towns, so "Hampstead" offered four streets near Manchester above the London district.
const PLACE_TYPES = 'country,region,postcode,district,place,locality,neighborhood'

// Below this zoom the map shows a continent or more, so its centre says nothing about the visitor.
const LOCAL_BIAS_MIN_ZOOM = 3

// Which place the geocoder ranks results near: the map's centre once it has settled on a country or
// closer. At world level, or with no map, the visitor's own area, which Mapbox reads from the
// request it already receives.
const searchBias = (zoom: number | undefined, center: LngLatLike | undefined) =>
  zoom !== undefined && zoom >= LOCAL_BIAS_MIN_ZOOM && center ? center : 'ip'

export function MapSearch({ onSelect, label, permanent }: MapSearchProps) {
  const [searchParams] = useSearchParams()
  const { pathname } = useLocation()
  const [searchQuery, setSearchQuery] = React.useState(searchParams.get('q') || '')
  const { mapbox } = useMapbox()
  const { locale } = useLocale()
  const { t } = useTranslation()
  const fieldLabel = label ?? t('search.chrome.placeholder')
  // Search stays in one country: the one on screen, else the searched place's (`?cc`), else the
  // last country page shown, else the one a client's home region sits in. Mapbox's ranking alone
  // puts Hampstead, Quebec above Hampstead, London even when told it is near the UK, and it offers
  // no way to prefer a country short of this filter. A search that finds nothing in that country
  // looks everywhere instead, by itself, so a visitor on the UK page can still find Prague. The
  // client comes from the bootstrap's cache; the field never fetches it.
  const browsed = useBrowsedCountry((s) => s.code)
  const { data: client } = useQuery({ ...clientQuery(atlasAuth.apiKey), enabled: false })
  const home = client?.region && typeof client.region === 'object' ? client.region : null
  const country =
    isoCountryCode(pathname.split('/')[1]) ??
    isoCountryCode(searchParams.get(SEARCH_COUNTRY_PARAM)) ??
    browsed ??
    isoCountryCode(home?.webPath?.split('/').filter(Boolean)[0])
  const [released, setReleased] = React.useState<ReleasedScope>()
  const scope = searchCountryScope(country, searchQuery, released)
  const [foundNothing, setFoundNothing] = React.useState(false)

  // This follows a new `?q`. The field seeds from the URL once, in the state initializer above.
  // But a pick writes a new place name, the geolocate control names the place it found AFTER
  // navigating, and `placeSearchPath` clears `?q` on every re-search. None of them remounts this
  // component when the view on top is unchanged, so without this effect the field would keep
  // showing a place the results are no longer about. Typing never writes `?q`, so the two can't
  // fight: half-typed text stays until the URL names a place.
  const urlQuery = searchParams.get('q') ?? ''
  const field = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const node = field.current

    return node ? hoistGeocoderLiveRegion(node) : undefined
  }, [])

  React.useEffect(() => {
    setSearchQuery(urlQuery)
  }, [urlQuery])

  const onSuggest = (response: GeocodingResponse) => {
    const none = response.features.length === 0

    if (none && scope) {
      setReleased({ country: scope, query: searchQuery })
      setFoundNothing(false)
      // The geocoder searches on input, so wait for it to take the wider options, then repeat the
      // query.
      requestAnimationFrame(() => {
        field.current?.querySelector('input')?.dispatchEvent(new Event('input', { bubbles: true }))
      })

      return
    }

    setFoundNothing(none)
  }

  return (
    // The Geocoder permanently reserves ~40px of right padding for its
    // "action" slot. The only thing that ever occupies it is the Clear (×)
    // button, which Mapbox itself hides (`display: none`) while the field is
    // empty. This returns that space to the placeholder whenever the field
    // is empty. `:placeholder-shown` stops matching the moment the user
    // types and the × appears, so the text never runs under it. (The
    // generated `mbx…--Input` class carries a per-build hash, so this
    // targets the element, not the class.)
    //
    // The geocoder's own input takes the same `field-size` floor `fieldChrome` carries
    // (#322), reached from out here because that input inherits its size from a container
    // `themes.ts` sizes with `unit` — the control's whole spacing scale, which also
    // drives the suggestion list and its `padding: 1em`.
    <div ref={field} className="[&_input]:field-size [&_input:placeholder-shown]:!pe-3">
      <GeocoderBoundary
        fallback={
          <input
            aria-label={fieldLabel}
            className="w-full rounded-lg border border-divider bg-gray-2 px-3 py-2 field-size text-foreground placeholder:text-gray-11"
            placeholder={fieldLabel}
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
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
            // `country` and `permanent` are left out rather than undefined: the geocoder
            // serializes what it's given.
            ...(scope ? { country: scope } : {}),
            ...(permanent ? { permanent } : {}),
            proximity: searchBias(mapbox?.getZoom(), mapbox?.getCenter()),
            types: PLACE_TYPES,
          }}
          placeholder={fieldLabel}
          theme={controlTheme}
          value={searchQuery}
          onChange={setSearchQuery}
          onRetrieve={onSelect}
          onSuggest={onSuggest}
        />
      </GeocoderBoundary>
      {/* Without this a place that doesn't exist left the list as it was, with no answer at all. */}
      {foundNothing && searchQuery.trim() && (
        <p className="pt-2 text-sm text-gray-11" role="status">
          {t('common.errors.not_found_region')}
        </p>
      )}
    </div>
  )
}
