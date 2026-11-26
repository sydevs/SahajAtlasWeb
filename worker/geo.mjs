/**
 * The visitor's approximate location, as the app Worker hands it to the widget: written into
 * `loader.js` and the standalone page at the edge, from Cloudflare's own `request.cf`, so the
 * widget knows it at first paint without asking a third party.
 *
 * Plain JavaScript with JSDoc types, so the Worker, the Vite dev server and the browser lane's
 * review server all run the same code. The widget's reader is `src/lib/approx-location.ts`, and
 * `worker/geo.test.ts` round-trips the two.
 */

/**
 * The string literal the build leaves in `loader.js` and `index.html` for the Worker to replace.
 * Unreplaced, it decodes to nothing, which the widget reads as "no guess". The loader's copy is
 * `GEO_PLACEHOLDER` in `src/loader/literals.ts`.
 */
export const GEO_PLACEHOLDER = '__SY_ATLAS_GEO__'

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
 * @typedef {object} GeoPayload
 * @property {1} v
 * @property {number} t seconds since the epoch, when the Worker wrote it
 * @property {string} [cc] ISO alpha-2 country code
 * @property {string} [city]
 * @property {number} [lat]
 * @property {number} [lon]
 */

/** @param {unknown} value @param {number} limit */
const coordinate = (value, limit) => {
  const n = typeof value === 'string' ? Number(value) : value

  return typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= limit ? n : undefined
}

/**
 * The payload for one request, or `null` when Cloudflare knows nothing useful. Only validated
 * fields go in: a city is kept only with both coordinates, since a name with no point cannot
 * frame a search.
 * @param {RequestGeo | undefined} cf
 * @param {number} nowMs
 * @returns {GeoPayload | null}
 */
export function geoPayload(cf, nowMs) {
  if (!cf) return null

  const cc =
    typeof cf.country === 'string' && /^[A-Z]{2}$/.test(cf.country) && !NO_COUNTRY.has(cf.country)
      ? cf.country
      : undefined
  const city =
    typeof cf.city === 'string' && cf.city.trim() && cf.city.length <= 100
      ? cf.city.trim()
      : undefined
  const lat = coordinate(cf.latitude, 90)
  const lon = coordinate(cf.longitude, 180)
  const place = city && lat !== undefined && lon !== undefined ? { city, lat, lon } : {}

  if (!cc && !place.city) return null

  return { v: 1, t: Math.floor(nowMs / 1000), ...(cc && { cc }), ...place }
}

/**
 * The payload as base64url of its UTF-8 JSON. That alphabet needs no escaping in a JS string of
 * either quote or in an HTML attribute, so the Worker never writes a character a parser treats
 * specially, whatever a city is called.
 * @param {GeoPayload} payload
 */
export function encodeGeo(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  let binary = ''

  for (const byte of bytes) binary += String.fromCharCode(byte)

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * `body` with its one placeholder replaced, or `null` if it holds none or several — a build
 * that moved or duplicated the literal is served unchanged rather than half-written.
 * @param {string} body
 * @param {string} token an `encodeGeo` result
 */
export function injectGeo(body, token) {
  const at = body.indexOf(GEO_PLACEHOLDER)

  if (at === -1 || body.indexOf(GEO_PLACEHOLDER, at + 1) !== -1) return null

  return body.slice(0, at) + token + body.slice(at + GEO_PLACEHOLDER.length)
}

/**
 * The location a dev server or test fixture writes in place of Cloudflare's: Prague, the city
 * every review screenshot of the location line has used.
 * @param {number} nowMs
 */
export const fixtureGeo = (nowMs) =>
  geoPayload({ country: 'CZ', city: 'Prague', latitude: '50.0880', longitude: '14.4208' }, nowMs)
