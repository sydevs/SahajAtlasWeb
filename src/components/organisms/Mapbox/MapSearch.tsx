import React, { Component, type ReactNode } from 'react'
import { Geocoder } from '@mapbox/search-js-react'
import { type GeocodingResponse, GeocodingFeature, type LngLatLike } from '@mapbox/search-js-core'
import { useLocation, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { repairGeocoderDom } from './geocoder-dom'
import { controlTheme } from './themes'

import { RESULTS_BAND } from '@/components/atoms/Drawer'
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
   * separately — so only a mount whose answer is submitted to SahajCloud sets it.
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

// Long enough to span a typing pause, short enough to answer a finished query promptly.
const NOT_FOUND_SETTLE_MS = 300

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
  // Declared only once typing has settled on that answer: each keystroke's response would
  // otherwise toggle it on and off under the field.
  const [settledNothing, setSettledNothing] = React.useState(false)

  React.useEffect(() => {
    if (!foundNothing) return setSettledNothing(false)

    const timer = setTimeout(() => setSettledNothing(true), NOT_FOUND_SETTLE_MS)

    return () => clearTimeout(timer)
  }, [foundNothing])

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

    if (!node) return undefined

    return repairGeocoderDom(node)
  }, [])

  // The suggestion list opens under the field and runs to the end of the band hosting it, past
  // any control after the field (the start page's Filters) but never past the band. Measured,
  // because the field need not start the band: SearchView's Back comes first.
  React.useLayoutEffect(() => {
    const node = field.current

    if (!node || typeof ResizeObserver === 'undefined') return undefined

    const band = node.closest<HTMLElement>(`.${RESULTS_BAND}`)
    const size = () => {
      const own = node.getBoundingClientRect()
      let width = own.width

      if (band) {
        const box = band.getBoundingClientRect()
        const style = getComputedStyle(band)

        width =
          style.direction === 'rtl'
            ? own.right - box.left - parseFloat(style.paddingLeft)
            : box.right - parseFloat(style.paddingRight) - own.left
      }
      // The list sits 1px inside the field's border on each side.
      node.style.setProperty('--sy-results-w', `${width - 2}px`)
    }
    const observer = new ResizeObserver(size)

    observer.observe(node)
    if (band) observer.observe(band)

    return () => observer.disconnect()
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
    <div
      ref={field}
      // ⚠ The min-height is the 44px tap floor reaching the geocoder's OWN input (#432), the
      // same way `field-size` reaches it: that element is the library's, so a class cannot be
      // put on it, and an `<input>` renders no `::after` for `touch-target` to use. Its one
      // `<button>`, the 20px clear ×, can, so it takes the tap area and the focus outline.
      // ⚠ Literal px, never a spacing step: the geocoder declares its own `--spacing` (0.75em),
      // which every step inside it multiplies, so `min-h-11` drew a 132px field on touch.
      className="relative [&_button]:touch-target [&_button]:relative [&_button]:focus-ring [&_input]:field-size [&_input]:pointer-coarse:min-h-[44px] [&_input:placeholder-shown]:!pe-[12px]"
    >
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
        {/* @ts-expect-error: @mapbox/search-js-react's `Geocoder` is typed against its own React types, so TS rejects it as a JSX component. */}
        <Geocoder
          accessToken={import.meta.env.VITE_MAPBOX_ACCESSTOKEN}
          map={mapbox?.getMap()}
          options={{
            // Follows a locale switch: this object is rebuilt every render, and the React wrapper
            // re-applies `options` to the element whenever it changes. Pinned in
            // `MapSearch.permanent.test.tsx`.
            language: locale,
            // `country` and `permanent` are left out rather than undefined: the geocoder
            // serializes what it's given. ⚠ A spread's keys escape the excess-property check,
            // so only `MapSearch.permanent.test.tsx` catches a misspelled one here.
            ...(scope ? { country: scope } : {}),
            ...(permanent ? { permanent } : {}),
            proximity: searchBias(mapbox?.getZoom(), mapbox?.getCenter()),
            types: PLACE_TYPES,
          }}
          placeholder={fieldLabel}
          theme={controlTheme}
          value={searchQuery}
          onChange={(value: string) => {
            setSearchQuery(value)
            // Pending until this text's own answer arrives.
            setFoundNothing(false)
          }}
          onRetrieve={onSelect}
          onSuggest={onSuggest}
        />
      </GeocoderBoundary>
      {/* Without this a place that doesn't exist left the list as it was, with no answer at all.
          It takes the suggestion list's place and look (`.Results` in themes.ts, 10px below the
          field), so it overlays rather than pushing the panel. The region stays mounted, so a
          screen reader announces the text when it arrives. */}
      <p
        className="absolute inset-x-0 top-[calc(100%+10px)] z-10 rounded-lg bg-background px-4 py-3 text-sm text-gray-11 shadow-[0_0_0_1px_hsl(var(--background)),0_8px_24px_rgb(0_0_0/0.16)] empty:hidden"
        role="status"
      >
        {settledNothing && searchQuery.trim() ? t('common.errors.not_found_region') : null}
      </p>
    </div>
  )
}
