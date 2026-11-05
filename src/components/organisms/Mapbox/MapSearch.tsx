import React, { Component, type ReactNode } from 'react'
import { Geocoder } from '@mapbox/search-js-react'
import { GeocodingFeature, type LngLatLike } from '@mapbox/search-js-core'
import { useLocation, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { hoistGeocoderLiveRegion } from './aria-live'
import { controlTheme } from './themes'

import { clientQuery } from '@/config/api'
import atlasAuth from '@/config/api/auth'
import { useLocale } from '@/hooks/use-locale'
import { useMapbox } from '@/hooks/use-mapbox'
import { isoCountryCode } from '@/lib/shape'

export interface MapSearchProps {
  /** Called with the geocoded place the user picked from the suggestions. */
  onSelect: (value: GeocodingFeature) => void
  /**
   * This mirrors what is typed into `?q` on the current URL (default `true`),
   * so a reload or a shared link keeps the query. Pass `false` where the
   * current URL is known-bad — the error screen for a dead link (issue #89).
   * Writing state into a URL already flagged as broken only spreads the
   * problem: embedded, that URL lives in the host page's `#!` fragment and
   * travels with anything the visitor copies.
   */
  syncToUrl?: boolean
  /**
   * This is the accessible name and placeholder. It defaults to the "search
   * for events near…" phrasing, which is right in a header, where position
   * already says what the field is for. But it reads as a promise of nearby
   * events when the field sits in an error body instead.
   */
  label?: string
  /**
   * Whether the field starts from, and follows, `?q` (default `true`). The filter form says
   * `false`: its field is only a way to pick a place, and the picked place shows beside it.
   */
  seedFromUrl?: boolean
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

export function MapSearch({
  onSelect,
  syncToUrl = true,
  label,
  seedFromUrl = true,
}: MapSearchProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const [searchQuery, setSearchQuery] = React.useState(
    seedFromUrl ? searchParams.get('q') || '' : '',
  )
  const { mapbox } = useMapbox()
  const { locale, regionNames } = useLocale()
  const { t } = useTranslation()
  const fieldLabel = label ?? t('search.chrome.city_or_postcode')
  // Search stays in the country on screen, or the one a client's home region sits in. Mapbox's
  // ranking alone puts Hampstead, Quebec above Hampstead, London even when told it is near the UK,
  // and it offers no way to prefer a country short of this filter. So a search that finds nothing
  // here offers to look everywhere. The client comes from the bootstrap's cache; the field never
  // fetches it.
  const { data: client } = useQuery({ ...clientQuery(atlasAuth.apiKey), enabled: false })
  const home = client?.region && typeof client.region === 'object' ? client.region : null
  const country =
    isoCountryCode(location.pathname.split('/')[1]) ??
    isoCountryCode(home?.webPath?.split('/').filter(Boolean)[0])
  const [releasedFrom, setReleasedFrom] = React.useState<string>()
  const scope = country !== releasedFrom ? country : undefined
  const [foundNothing, setFoundNothing] = React.useState(false)

  // This merges `q` into the existing query, so the active filters (and
  // bbox and center) survive typing — they live only in the URL now.
  // `replace` means per-keystroke edits do not stack history. Both the
  // geocoder and the plain fallback share this function.
  //
  // `state` is carried explicitly. `setSearchParams` forwards only what it is
  // given, so a bare `{ replace: true }` replaces the entry with a
  // state-less one and drops its `atlasDepth`. After ONE keystroke, the
  // drawer's dismissal (X, swipe, or Esc) would then push to the structural
  // parent, instead of going chronologically back. The filter and sort
  // setters carry it for the same reason.
  // This adopts a `?q` that somebody ELSE wrote. The field seeds from the URL
  // once, in the state initializer above, which is right while typing is the
  // only writer. But the geolocate control names the place it found AFTER
  // navigating, and `placeSearchPath` clears `?q` on every re-search. Neither
  // one remounts this component when the view on top is unchanged. So
  // without this effect, the field keeps showing a place the results are no
  // longer about.
  //
  // This guards on the last value written here, rather than on equality with
  // the field. So the per-keystroke mirroring below can never fight it:
  // typing records its own write, sees the URL agree, and does nothing.
  const urlQuery = searchParams.get('q') ?? ''
  const ownWrite = React.useRef(urlQuery)
  const field = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const scope = field.current

    return scope ? hoistGeocoderLiveRegion(scope) : undefined
  }, [])

  React.useEffect(() => {
    if (!seedFromUrl || urlQuery === ownWrite.current) return

    ownWrite.current = urlQuery
    setSearchQuery(urlQuery)
  }, [urlQuery, seedFromUrl])

  const setQuery = (query: string) => {
    setSearchQuery(query)
    ownWrite.current = query
    if (!syncToUrl) return

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)

        next.set('q', query)

        return next
      },
      { replace: true, state: location.state },
    )
  }

  const searchEverywhere = () => {
    setReleasedFrom(country)
    setFoundNothing(false)
    // The geocoder searches on input, so wait for it to take the wider options, then repeat the query.
    requestAnimationFrame(() => {
      const input = field.current?.querySelector('input')

      input?.focus()
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })
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
            language: locale, // TODO: Make sure this switches when locale changes
            // `country` is left out rather than undefined: the geocoder serializes what it's given.
            ...(scope ? { country: scope } : {}),
            proximity: searchBias(mapbox?.getZoom(), mapbox?.getCenter()),
            types: PLACE_TYPES,
          }}
          placeholder={fieldLabel}
          theme={controlTheme}
          value={searchQuery}
          onChange={setQuery}
          onRetrieve={onSelect}
          onSuggest={(response) => setFoundNothing(response.features.length === 0)}
        />
      </GeocoderBoundary>
      {scope && foundNothing && searchQuery.trim() && (
        <p className="pt-2 text-sm text-gray-11" role="status">
          {t('search.chrome.none_in_country', { country: regionNames.of(scope) ?? scope })}{' '}
          <button className="text-primary-11 underline" type="button" onClick={searchEverywhere}>
            {t('search.chrome.search_all_countries')}
          </button>
        </p>
      )}
    </div>
  )
}
