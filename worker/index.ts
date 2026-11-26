/**
 * The app Worker. Everything is a static asset except the two paths `run_worker_first` routes
 * here — `loader.js` and the standalone page at `/`. Each gets the visitor's approximate location
 * written in (`worker/geo.mjs`), and is otherwise the asset unchanged.
 *
 * ⚠ `public/_headers` does not apply to a response this script builds, so the site-wide CORS and
 * `noindex` are set here too. A module script on a host page is a CORS request, and without
 * `Access-Control-Allow-Origin` the widget never loads (#91).
 */
import { encodeGeo, geoPayload, injectGeo } from './geo.mjs'

type Env = { ASSETS: { fetch: (request: Request) => Promise<Response> } }

type IncomingRequest = Request & { cf?: Record<string, unknown> }

/** Whether a response is a body this Worker writes the location into. */
const injectable = (response: Response) =>
  response.status === 200 && /javascript|html/i.test(response.headers.get('content-type') ?? '')

export async function handle(request: IncomingRequest, env: Env, nowMs: number) {
  // A conditional request would let the asset layer answer 304, and the browser would reuse a
  // copy holding another visit's location, or none.
  const headers = new Headers(request.headers)

  headers.delete('if-none-match')
  headers.delete('if-modified-since')

  const asset = await env.ASSETS.fetch(new Request(request, { headers }))

  if (request.method !== 'GET' || !injectable(asset)) return withSiteHeaders(asset)

  const payload = geoPayload(request.cf, nowMs)
  const body = await asset.text()
  const written = payload ? injectGeo(body, encodeGeo(payload)) : null
  const response = withSiteHeaders(new Response(written ?? body, asset))

  // Per visitor, so never stored by a browser or a shared cache. `max-age=0` keeps the entry
  // files' freshness rule (`cache-headers.smoke.test.ts`) readable as a number.
  response.headers.set('cache-control', 'private, max-age=0, no-store')
  response.headers.delete('etag')
  response.headers.delete('last-modified')

  return response
}

/** The `/*` rule of `public/_headers`, set rather than appended so it can never repeat. */
function withSiteHeaders(response: Response) {
  const copy = new Response(response.body, response)

  copy.headers.set('access-control-allow-origin', '*')
  copy.headers.set('x-robots-tag', 'noindex')

  return copy
}

export default {
  async fetch(request: IncomingRequest, env: Env) {
    try {
      return await handle(request, env, Date.now())
    } catch {
      // The location is a convenience: any failure serves the file as the build wrote it.
      return withSiteHeaders(await env.ASSETS.fetch(request))
    }
  },
}
