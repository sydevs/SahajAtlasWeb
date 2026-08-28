import type { Geojson } from '@/types'

import { useCallback } from 'react'
import { useLocation, useSearchParams } from 'react-router'

import { useAtlasNavigate } from '@/hooks/use-atlas-navigate'
import { useLocale } from '@/hooks/use-locale'
import { geocodeCountryCode, reverseGeocode } from '@/lib/geocode'
import { nearbyBounds } from '@/lib/geolocation'
import { SEARCH_COUNTRY_PARAM, placeSearchPath } from '@/lib/shape'

/**
 * What "find my location" does: open the distance-ranked results centred on the visitor, framed
 * around the classes near them.
 *
 * **It is a navigation, not a camera command**, which is what makes the whole thing simple. The
 * URL becomes `/search?center=…&bbox=…`, and SearchView's existing `frameSearch` does the
 * framing — so the fit is capped at `REGION_MAX_ZOOM` for free, the results list re-ranks from
 * the new centre, and the bottom sheet rises out of its peek. Mapbox's control on its own only
 * moved the camera, to the accuracy circle at zoom 15: a street corner with the classes
 * off-screen and the list still ranked from wherever the map happened to be.
 *
 * ⚠ Two structural reasons the handler lives here rather than in `Map.tsx`:
 *
 *  - `Map.tsx` cannot import `views/shared.tsx`, which is where this wiring would otherwise sit
 *    beside `GeolocationSuggestion`'s identical flow — `shared.tsx` imports `MapSearch` from the
 *    organisms barrel, which re-exports `Mapbox`. A real cycle.
 *  - `Map.tsx` cannot call `useMapController()` at all: it is a SIBLING of
 *    `RealMapControllerProvider`, not a descendant, so it would silently receive the no-op.
 *
 * The feed arrives as an argument because `Map.tsx` already holds it — passing it keeps this off
 * a second `['geojson']` observer for a value the caller is already subscribed to.
 */
export function useGeolocateToSearch(geojson: Geojson | undefined) {
  const navigate = useAtlasNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { locale } = useLocale()

  return useCallback(
    (position: GeolocationPosition) => {
      const point: [number, number] = [position.coords.longitude, position.coords.latitude]

      // Navigate FIRST, on the coordinates alone. Getting here has already cost up to Mapbox's
      // six-second `positionOptions.timeout`, so nothing else may be waited on before the map
      // moves and the list re-ranks.
      navigate(placeSearchPath(searchParams, { center: point, bbox: nearbyBounds(point, geojson) }))

      // Then name the place, if the network obliges. `?q` fills the search field so it says
      // where the results are from, and `?cc` turns on the country-site offer and the
      // foreign-distance rule — neither of which a `GeolocationPosition` can supply.
      //
      // `replace` so the naming is not a second history entry the back button has to walk
      // through, and `state` carried explicitly because `setSearchParams` forwards only what it
      // is given: a bare `{ replace: true }` drops `atlasDepth` and the drawer's X would climb
      // to the structural parent instead of going back. Same reason `MapSearch.setQuery` does it.
      void reverseGeocode(point, locale).then((feature) => {
        if (!feature) return

        const label = feature.properties?.full_address
        const countryCode = geocodeCountryCode(feature)

        if (!label && !countryCode) return

        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev)

            if (label) next.set('q', label)
            if (countryCode) next.set(SEARCH_COUNTRY_PARAM, countryCode)

            return next
          },
          { replace: true, state: location.state },
        )
      })
    },
    [navigate, searchParams, setSearchParams, geojson, locale, location.state],
  )
}
