import type { Geojson } from '@/types'

import { useCallback, useRef } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'

import { useAtlasNavigate } from '@/hooks/use-atlas-navigate'
import { useLocale } from '@/hooks/use-locale'
import { geocodeCountryCode, reverseGeocode } from '@/lib/geocode'
import { nearbyBounds } from '@/lib/geolocation'
import { placeSearchPath } from '@/lib/shape'

/**
 * This is what "find my location" does: it opens the distance-ranked results centered on the visitor, framed around the classes near them.
 *
 * **This is a navigation, not a camera command.** That is what makes the whole thing simple.
 * The URL becomes `/search?center=…&bbox=…`, and SearchView's existing `frameSearch` does the framing.
 * So the fit caps at `REGION_MAX_ZOOM` for free, the results list re-ranks from the new center, and the bottom sheet rises out of its peek.
 * Mapbox's control on its own only moved the camera, to the accuracy circle at zoom 15.
 * That left a street corner with the classes off-screen, and the list still ranked from wherever the map happened to be.
 *
 * ⚠ Two structural reasons put this handler here, not in `Map.tsx`:
 *
 *  - `Map.tsx` cannot import `views/shared.tsx`.
 *    This wiring would otherwise sit there, beside `GeolocationSuggestion`'s identical flow.
 *    `shared.tsx` imports `MapSearch` from the organisms barrel, which re-exports `Mapbox`. That would be a real cycle.
 *  - `Map.tsx` cannot call `useMapController()` at all.
 *    It is a SIBLING of `RealMapControllerProvider`, not a descendant, so it would silently receive the no-op.
 *
 * The feed arrives as an argument because `Map.tsx` already holds it.
 * Passing it keeps this hook off a second `['geojson']` observer, for a value the caller is already subscribed to.
 */
export function useGeolocateToSearch(geojson: Geojson | undefined) {
  const navigate = useAtlasNavigate()
  // This is the RAW navigate, for the naming replace below.
  // `useAtlasNavigate` is for pushes. It stamps an incrementing `atlasDepth` and remembers the outgoing camera.
  // Doing either for an entry that added no history would leave the drawer stack drawing a peek strip for a back-step that does not exist.
  // Its own docblock reserves it for pushes, the same way FilterView's apply-replace does.
  const replace = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { locale } = useLocale()

  /**
   * ⚠ **Mapbox constructs the control and binds the handler this returns ONCE.**
   * So the handler must not close over router state.
   * `Map.tsx` documents the same construction-only behavior for the `locale` prop.
   * This is not theoretical.
   * The first version of this hook read `searchParams` and `setSearchParams` from the closure.
   * The stale `replace` function they carried rewrote `/search?center=…&bbox=…` back to the route the widget had been on when the map mounted.
   * That dropped the search the visitor had just performed.
   * Only a browser test measured this. Nothing else caught it.
   *
   * A ref refreshed every render is the fix.
   * `Mapbox` already re-renders on filter and location changes, so this ref is always current by the time anyone can press the control.
   */
  const live = useRef({ navigate, replace, location, searchParams, geojson, locale })

  live.current = { navigate, replace, location, searchParams, geojson, locale }

  return useCallback((position: GeolocationPosition) => {
    const { navigate: go, searchParams: params, geojson: feed, locale: lang } = live.current
    // This rounds to about 110m BEFORE anything serializes it.
    // So the visitor's doorstep never reaches a URL they might copy, or their host page's analytics.
    // This costs nothing the feature can see.
    // The frame is a neighborhood, `NEARBY_RADIUS_KM` is 25km, and the list ranks over hundreds of km.
    // Both are orders of magnitude coarser than this rounding.
    //
    // This is the same judgement `reverseGeocode` below already makes, by asking for `place` rather than a street address.
    // This is the coordinate half of that judgement.
    // The first version left it at full float precision, while the label beside it was being deliberately coarsened.
    //
    // This rounding lives here, not in `placeSearchPath`.
    // The other two callers pass a typed geocode or an IP guess, both already public and coarse.
    // Blurring those would only cost accuracy.
    const round = (n: number) => Math.round(n * 1e3) / 1e3
    const point: [number, number] = [
      round(position.coords.longitude),
      round(position.coords.latitude),
    ]
    const place = { center: point, bbox: nearbyBounds(point, feed) }

    // This navigates FIRST, on the coordinates alone.
    // Getting here has already cost up to Mapbox's six-second `positionOptions.timeout`.
    // So nothing else may wait before the map moves and the list re-ranks.
    const target = placeSearchPath(params, place)

    go(target)

    // This then names the place, if the network obliges.
    // `?q` fills the search field, so it says where the results are from.
    // `?cc` turns on the country-site offer and the foreign-distance rule.
    // A `GeolocationPosition` can supply neither value.
    //
    // This rebuilds the URL from the same `params` and `place`, instead of merging onto whatever the URL says by then.
    // So the naming cannot disturb the search it is naming.
    void reverseGeocode(point, lang).then((feature) => {
      if (!feature) return

      const q = feature.properties?.full_address ?? undefined
      const countryCode = geocodeCountryCode(feature)

      if (!q && !countryCode) return

      // ⚠ **This labels only the search we started, and only while the visitor is still on it.**
      // This promise resolves a few hundred ms late, easily long enough to tap a class.
      // A `replace` fired then would overwrite THAT route with the search, with no Back to undo it.
      // Comparing against the route we pushed is exact, because both sides come from `placeSearchPath` over the same inputs.
      const now = live.current.location

      if (`${now.pathname}${now.search}` !== target) return

      live.current.replace(placeSearchPath(params, { ...place, q, countryCode }), {
        replace: true,
        // This carries the state explicitly. The raw navigate forwards only what it is given.
        // Dropping the entry's `atlasDepth` would make the drawer's X climb to the structural parent instead of going back.
        // `MapSearch.setQuery` carries it for the same reason.
        state: now.state,
      })
    })
  }, [])
}
