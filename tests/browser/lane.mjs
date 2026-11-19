// The browser lane's own build settings, shared by its build, its config and its specs.

/** Where the lane builds to — never `dist/`, which `pnpm size` measures and a deploy uploads. */
export const LANE_DIST = 'dist-browser'

/** Not the dev server's 5174, so the lane runs beside `pnpm dev` and `pnpm review:embed`. */
export const LANE_PORT = Number(process.env.BROWSER_LANE_PORT || 5310)

/**
 * SahajCloud's origin in the lane's build. `.invalid` never resolves (RFC 6761), so a request
 * the fixtures fail to route reaches nobody's backend, least of all production's.
 */
export const LANE_API_ORIGIN = 'https://sahajcloud.invalid'

/**
 * A dummy Mapbox token in the shape mapbox-gl reads: `pk.`, a base64 JSON payload, a signature.
 * It refuses `sk.` outright and decodes the payload for its storage keys, so a bare string is
 * not enough. Composed rather than written out, so no secret scanner mistakes it for a leak.
 */
export const LANE_MAPBOX_TOKEN = `pk.${Buffer.from(
  JSON.stringify({ u: 'browser-lane', a: 'not-a-real-token' }),
).toString('base64')}.browser-lane`

/**
 * The only `VITE_*` values the lane's build sees (`build.mjs` drops every other one, and reads no
 * env file). Every variable not named here is unset, so the bundle takes its own default: no
 * Sentry, no Fathom, no build-time API key, the default fallback URL.
 */
export const LANE_BUILD_ENV = {
  VITE_SAHAJCLOUD_URL: LANE_API_ORIGIN,
  VITE_MAPBOX_ACCESSTOKEN: LANE_MAPBOX_TOKEN,
}
