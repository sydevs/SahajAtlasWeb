import type { GeocodingFeature, GeocodingFeatureContextComponent } from '@mapbox/search-js-core'

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
 * assignment outright. Optional-chained because this is remote data: the vendor types
 * mark `properties`/`context` required, but a shape change shouldn't throw out of a
 * search callback, and `isoCountryCode` validates whatever does come back.
 */
type CountryContext = GeocodingFeatureContextComponent & { country_code?: string }

export const geocodeCountryCode = (feature: GeocodingFeature): string | undefined => {
  const country: CountryContext | undefined = feature.properties?.context?.country

  return isoCountryCode(country?.country_code)
}
