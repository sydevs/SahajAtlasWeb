/**
 * The app Worker. Every file is a static asset except `/geo.js`, the only path
 * `run_worker_first` routes here: a per-visitor module holding their approximate location
 * (`worker/geo.mjs`), built from `request.cf`.
 *
 * ⚠ `public/_headers` does not apply to a response this script builds, so the site-wide CORS and
 * `noindex` are set here too. The loader imports this module from a host page, which is a CORS
 * request: without `Access-Control-Allow-Origin` the import fails, and the widget boots with no
 * location.
 */
import { GEO_PATH, approxLocation, geoModule } from './geo.mjs'

type Env = { ASSETS: { fetch: (request: Request) => Promise<Response> } }

type IncomingRequest = Request & { cf?: Record<string, unknown> }

export function geoResponse(request: IncomingRequest) {
  return new Response(geoModule(approxLocation(request.cf)), {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      // Per visitor, so never stored by a browser or a shared cache. `max-age=0` keeps the entry
      // files' freshness rule (`cache-headers.smoke.test.ts`) readable as a number.
      'cache-control': 'private, max-age=0, no-store',
      'access-control-allow-origin': '*',
      'x-robots-tag': 'noindex',
    },
  })
}

export default {
  fetch(request: IncomingRequest, env: Env) {
    return new URL(request.url).pathname === GEO_PATH
      ? geoResponse(request)
      : env.ASSETS.fetch(request)
  },
}
