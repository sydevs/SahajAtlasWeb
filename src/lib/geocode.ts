import type {
  FeatureTypes,
  GeocodingFeature,
  GeocodingFeatureContextComponent,
} from '@mapbox/search-js-core'
import type { BBox } from 'geojson'

import { isoCountryCode } from '@/lib/shape'

/**
 * The ISO alpha-2 country a geocoded feature sits in, or `undefined` when the
 * result carries none (an ocean, a hand-built feature).
 *
 * Mapbox Geocoding v6 puts the code on `properties.context.country.country_code`
 * for *every* level — a country-level result's own context describes itself — so
 * one read covers both "searched a country" and "searched a town in one".
 *
 * The country context is widened locally rather than the vendor type app-wide:
 * `GeocodingFeatureContextComponent` declares only `mapbox_id`/`name`/`wikidata_id`,
 * even though the API documents (and returns) `country_code`/`country_code_alpha_3`
 * on the country component. It has to be an *intersection* rather than a bare
 * `{ country_code?: string }` — the two share no declared property, so TS rejects the
 * assignment outright. This is optional-chained because it is remote data. The vendor
 * types mark `properties`/`context` required, but a shape change should not throw out
 * of a search callback, and `isoCountryCode` validates whatever does come back.
 */
type CountryContext = GeocodingFeatureContextComponent & { country_code?: string }

export const geocodeCountryCode = (feature: GeocodingFeature): string | undefined => {
  const country: CountryContext | undefined = feature.properties?.context?.country

  return isoCountryCode(country?.country_code)
}

/**
 * A geocoded feature's own bounding box, as the four numbers the `?bbox` wire format carries.
 *
 * The vendor type is `LngLatBoundsLike`, a union that also admits a `LngLatBounds` INSTANCE and a
 * nested corner pair — and the previous inline `bbox.toString()` would have written `[object
 * Object]` or an eight-number string for either, which `parseBounds` then discards in silence,
 * degrading the fit to the centre's pinpoint zoom. Mapbox Geocoding v6 returns the flat array in
 * practice, so this narrows to that and treats anything else as absent.
 */
export const geocodeBounds = (feature: GeocodingFeature): BBox | undefined => {
  const bbox = feature.properties?.bbox

  return Array.isArray(bbox) && bbox.length === 4 && bbox.every(Number.isFinite)
    ? (bbox as BBox)
    : undefined
}

/**
 * The place a `[longitude, latitude]` sits in — the same `GeocodingFeature` the search field
 * hands `onRetrieve`, so a device fix can name where it is in exactly the terms a typed search
 * does.
 *
 * A browser `GeolocationPosition` carries only coordinates. Without this, "find my location"
 * leaves the search field blank over its own results and writes no `?cc`, which is what
 * `useCountrySite` reads to offer a country's own website when it lists no classes, and what
 * `revealRows` reads to stop ranking foreign classes ahead of reachable domestic ones.
 *
 * **Never throws, and resolves `null` on anything unexpected.** It runs after a navigation has
 * already happened — the results are on screen, ranked by distance from the fix — so a failure
 * here costs a place name and a country code, not the feature. Same posture as `fetchIpLocation`.
 *
 * No CSP consequence: `api.mapbox.com` is already in the documented `connect-src`, because the
 * forward geocoder behind the search field calls the same host.
 */
export const reverseGeocode = async (
  point: [number, number],
  locale?: string,
): Promise<GeocodingFeature | null> => {
  const accessToken = import.meta.env.VITE_MAPBOX_ACCESSTOKEN

  if (!accessToken) return null

  try {
    const { GeocodingCore } = await import('@mapbox/search-js-core')
    const response = await new GeocodingCore({ accessToken }).reverse(
      { lng: point[0], lat: point[1] },
      // `place` is the town/city level — the granularity the field's text should read at. A
      // bare reverse call returns the most specific match, which is a street address, and a
      // visitor's doorstep is not something to write into a shareable URL.
      { language: locale, limit: 1, types: new Set<FeatureTypes>(['place']) },
    )

    return response?.features?.[0] ?? null
  } catch {
    return null
  }
}
