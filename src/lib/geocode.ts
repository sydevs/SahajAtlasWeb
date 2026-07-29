import type { GeocodingFeature, GeocodingFeatureContextComponent } from '@mapbox/search-js-core'

// Reading a country out of a geocoder result, and the one canonical form for an
// ISO alpha-2 code across the app.

/**
 * A country code normalized to the app's canonical form: **uppercase** alpha-2, or
 * `undefined` for anything else.
 *
 * Upper is canonical because `Intl.DisplayNames({ type: 'region' })` is
 * case-sensitive — `.of('gb')` echoes back `"gb"` while `.of('GB')` resolves
 * "United Kingdom" — and `COUNTRY_SITES` is keyed the same way. Callers that need
 * lower (`CircleFlag`, a region slug) lowercase it at the call site.
 *
 * Guarding the shape here means a malformed value (an un-migrated region slug, a
 * hand-typed `?cc=USA`) yields no country rather than throwing downstream in
 * `Intl.DisplayNames` / `CircleFlag`.
 */
export const isoCountryCode = (value: string | null | undefined): string | undefined =>
  typeof value === 'string' && /^[A-Za-z]{2}$/.test(value) ? value.toUpperCase() : undefined

/**
 * The ISO alpha-2 country a geocoded feature sits in, or `undefined` when the
 * result carries none (an ocean, a hand-built feature).
 *
 * Mapbox Geocoding v6 puts the code on `properties.context.country.country_code`
 * for *every* level — a country-level result's own context describes itself — so
 * one read covers both "searched a country" and "searched a town in one".
 *
 * The read widens the country context locally rather than the vendor type app-wide:
 * `GeocodingFeatureContextComponent` declares only `mapbox_id`/`name`/`wikidata_id`,
 * even though the API documents (and returns) `country_code`/`country_code_alpha_3`
 * on the country component. `isoCountryCode` still validates whatever comes back,
 * so an absent or non-conforming value yields `undefined` rather than propagating.
 */
type CountryContext = GeocodingFeatureContextComponent & { country_code?: string }

export const geocodeCountryCode = (feature: GeocodingFeature): string | undefined => {
  const country: CountryContext | undefined = feature.properties?.context?.country

  return isoCountryCode(country?.country_code)
}
