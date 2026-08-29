import type { Geojson } from '@/types'

import { useCallback, useRef } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'

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
  // The RAW navigate for the naming replace below. `useAtlasNavigate` is for pushes: it stamps
  // an incrementing `atlasDepth` and remembers the outgoing camera, and doing either for an
  // entry that added no history would leave the drawer stack drawing a peek strip for a
  // back-step that does not exist. Its own docblock reserves it, the same way FilterView's
  // apply-replace does.
  const replace = useNavigate()
  const location = useLocation()
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
  const live = useRef({ navigate, replace, location, searchParams, geojson, locale })

  live.current = { navigate, replace, location, searchParams, geojson, locale }

  return useCallback((position: GeolocationPosition) => {
    const { navigate: go, searchParams: params, geojson: feed, locale: lang } = live.current
    // Rounded to ~110m BEFORE anything serialises it, so the visitor's doorstep never reaches a
    // URL they might copy, or their host page's analytics. Costs nothing the feature can see: the
    // frame is a neighbourhood (`NEARBY_RADIUS_KM` is 25km) and the list ranks over hundreds of
    // km, both orders of magnitude coarser than this.
    //
    // It is the same judgement `reverseGeocode` below already makes by asking for `place` rather
    // than a street address — this is the coordinate half of it, which the first version left at
    // full float precision while the label beside it was being deliberately coarsened.
    //
    // Here rather than in `placeSearchPath`: the other two callers pass a typed geocode or an IP
    // guess, both already public and coarse, and blurring those would only cost accuracy.
    const round = (n: number) => Math.round(n * 1e3) / 1e3
    const point: [number, number] = [
      round(position.coords.longitude),
      round(position.coords.latitude),
    ]
    const place = { center: point, bbox: nearbyBounds(point, feed) }

    // Navigate FIRST, on the coordinates alone. Getting here has already cost up to Mapbox's
    // six-second `positionOptions.timeout`, so nothing else may be waited on before the map
    // moves and the list re-ranks.
    const target = placeSearchPath(params, place)

    go(target)

    // Then name the place, if the network obliges. `?q` fills the search field so it says where
    // the results are from, and `?cc` turns on the country-site offer and the foreign-distance
    // rule — neither of which a `GeolocationPosition` can supply.
    //
    // Rebuilt from the same `params` and `place` rather than merged onto whatever the URL says
    // by then, so the naming cannot disturb the search it is naming.
    void reverseGeocode(point, lang).then((feature) => {
      if (!feature) return

      const q = feature.properties?.full_address ?? undefined
      const countryCode = geocodeCountryCode(feature)

      if (!q && !countryCode) return

      // ⚠ **Only label the search we started, and only while the visitor is still on it.** This
      // resolves a few hundred ms late, which is easily long enough to tap a class — and a
      // `replace` fired then would overwrite THAT route with the search, with no Back to undo
      // it. Comparing against the route we pushed is exact, because both sides come from
      // `placeSearchPath` over the same inputs.
      const now = live.current.location

      if (`${now.pathname}${now.search}` !== target) return

      live.current.replace(placeSearchPath(params, { ...place, q, countryCode }), {
        replace: true,
        // Carried explicitly: the raw navigate forwards only what it is given, and dropping the
        // entry's `atlasDepth` would make the drawer's X climb to the structural parent instead
        // of going back. Same reason `MapSearch.setQuery` carries it.
        state: now.state,
      })
    })
  }, [])
}
