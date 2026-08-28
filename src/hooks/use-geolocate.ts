import type { Geojson } from '@/types'

import { useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router'

import { useAtlasNavigate } from '@/hooks/use-atlas-navigate'
import { useLocale } from '@/hooks/use-locale'
import { geocodeCountryCode, reverseGeocode } from '@/lib/geocode'
import { nearbyBounds } from '@/lib/geolocation'
import { placeSearchPath } from '@/lib/shape'

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
  const [searchParams] = useSearchParams()
  const { locale } = useLocale()

  /**
   * ⚠ **The handler this returns is bound ONCE, when Mapbox constructs the control**, so it must
   * not close over router state — the same construction-only behaviour `Map.tsx` documents for
   * the `locale` prop, and it is not theoretical: the first version of this read `searchParams`
   * and `setSearchParams` from the closure, and the stale `replace` they carried rewrote
   * `/search?center=…&bbox=…` back to the route the widget had been on when the map mounted,
   * dropping the search it had just performed. Measured in a browser; nothing else caught it.
   *
   * A ref refreshed every render is the fix: `Mapbox` re-renders on filter and location changes
   * already, so this is always current by the time anyone can press the control.
   */
  const live = useRef({ navigate, searchParams, geojson, locale })

  live.current = { navigate, searchParams, geojson, locale }

  return useCallback((position: GeolocationPosition) => {
    const { navigate: go, searchParams: params, geojson: feed, locale: lang } = live.current
    const point: [number, number] = [position.coords.longitude, position.coords.latitude]
    const place = { center: point, bbox: nearbyBounds(point, feed) }

    // Navigate FIRST, on the coordinates alone. Getting here has already cost up to Mapbox's
    // six-second `positionOptions.timeout`, so nothing else may be waited on before the map
    // moves and the list re-ranks.
    go(placeSearchPath(params, place))

    // Then name the place, if the network obliges. `?q` fills the search field so it says where
    // the results are from, and `?cc` turns on the country-site offer and the foreign-distance
    // rule — neither of which a `GeolocationPosition` can supply.
    //
    // Rebuilt from the same `params` and `place` rather than merged onto whatever the URL says
    // by then, so the naming cannot disturb the search it is naming. `replace` because this is
    // the same destination gaining a label, not a second place to press Back through.
    void reverseGeocode(point, lang).then((feature) => {
      if (!feature) return

      const q = feature.properties?.full_address ?? undefined
      const countryCode = geocodeCountryCode(feature)

      if (!q && !countryCode) return

      go(placeSearchPath(params, { ...place, q, countryCode }), { replace: true })
    })
  }, [])
}
