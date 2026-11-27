/**
 * The visitor's approximate location, as the app Worker serves it: `/geo.js`, a module whose
 * default export is the location Cloudflare reads off that request (`request.cf`), or `null`.
 * The loader imports it beside the widget, so no third party is asked and no host changes its
 * CSP: a module from the widget's own origin is already covered by `script-src`.
 *
 * Plain JavaScript with JSDoc types, so the Worker and the Vite dev server share it. The
 * widget's reader is `src/lib/approx-location.ts`, and `worker/geo.test.ts` round-trips the two.
 */

/** Where the module is served, beside `loader.js`. The loader's copy is `GEO_MODULE`. */
export const GEO_PATH = '/geo.js'

/** Cloudflare's codes for "unknown" and "Tor", which name no country. */
const NO_COUNTRY = new Set(['XX', 'T1'])

/**
 * @typedef {object} RequestGeo The `request.cf` fields this reads, all optional.
 * @property {unknown} [country]
 * @property {unknown} [city]
 * @property {unknown} [latitude]
 * @property {unknown} [longitude]
 */

/**
 * @typedef {object} ApproxLocation The widget's own shape (`src/lib/approx-location.ts`).
 * @property {string} [countryCode]
 * @property {{ city: string, center: [number, number] }} [place]
 */

/** @param {unknown} value @param {number} limit */
const coordinate = (value, limit) => {
  // `Number('')` is 0, which would put a blank coordinate on Null Island.
  const n = typeof value === 'string' ? (value.trim() ? Number(value) : NaN) : value

  return typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= limit ? n : undefined
}

/**
 * The location for one request, or `null` when Cloudflare knows nothing useful. A town is kept
 * only with both coordinates, since a name with no point cannot frame a search.
 * @param {RequestGeo | undefined} cf
 * @returns {ApproxLocation | null}
 */
export function approxLocation(cf) {
  if (!cf) return null

  const countryCode =
    typeof cf.country === 'string' && /^[A-Z]{2}$/.test(cf.country) && !NO_COUNTRY.has(cf.country)
      ? cf.country
      : undefined
  const city = typeof cf.city === 'string' ? cf.city.trim() : ''
  const lat = coordinate(cf.latitude, 90)
  const lon = coordinate(cf.longitude, 180)
  const place =
    city && city.length <= 100 && lat !== undefined && lon !== undefined
      ? { city, center: /** @type {[number, number]} */ ([lon, lat]) }
      : undefined

  if (!countryCode && !place) return null

  return { ...(countryCode && { countryCode }), ...(place && { place }) }
}

/**
 * The module's source. JSON is a JavaScript expression, and since ES2019 that holds for every
 * string it can contain, so a city's name needs no escaping of its own.
 * @param {ApproxLocation | null} location
 */
export const geoModule = (location) => `export default ${JSON.stringify(location)}\n`
