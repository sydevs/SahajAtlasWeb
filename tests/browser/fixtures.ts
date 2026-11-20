import type { BrowserContext, Page, Request, Route } from '@playwright/test'
import type { Json } from '../../src/mocks/wire'

import { test as base, expect } from '@playwright/test'

import { answerSahajCloud } from '../../src/mocks/wire'

import { LANE_API_ORIGIN, LANE_PORT } from './lane.mjs'

/** The review server's origin. Everything else a page asks for is answered here or fails. */
export const LANE_ORIGIN = `http://localhost:${LANE_PORT}`

/** The element on every host page. Locators pierce its open shadow root, so specs scope to it. */
export const widget = (page: Page) => page.locator('sahaj-atlas')

/** The widget's route, off the host page's own URL — `null` when the widget has none there. */
export const atlasRoute = (page: Page) => new URL(page.url()).searchParams.get('atlas')

/** One of the review server's host pages (`scripts/serve-embed-review.mjs`), at a route. */
export const hostPage = (name: string, route?: string) =>
  `/__review/${name}${route ? `?atlas=${route}` : ''}`

/**
 * Fills a snapshot string the way i18next does for this widget (`%{name}`), so a spec reads the
 * copy the fixtures serve rather than restating it.
 */
export const copy = (text: string, values: Record<string, string> = {}) =>
  text.replace(/%\{(\w+)\}/g, (_, name: string) => values[name] ?? '')

/** The mapbox-gl library chunk, which only an interface that draws a map has any use for. */
export const MAPBOX_CHUNK = /\/assets\/mapbox-gl-[\w-]+\.js$/

/** How long the page must go with nothing in flight before a spec may say a request never came. */
const QUIET_MS = 500

/**
 * Resolves once the widget has rendered for real — `AppShell` reports the embed to SahajCloud
 * only after its first genuine render — and the network has then gone quiet, so a request a spec
 * says never happens has had every chance to. Register it before navigating.
 *
 * ⚠ **The report alone orders nothing.** An effect's lazy import can leave after it, and did
 * (the mapbox-gl chunk, up to 116 ms later). Nor is `waitForLoadState('networkidle')` the
 * barrier: Playwright fires it once per navigation and never re-arms it, so when it fired before
 * the report it resolves at once.
 */
export const rendered = async (page: Page) => {
  const inflight = new Set<Request>()
  let lastActivity = Date.now()
  const started = (request: Request) => {
    inflight.add(request)
    lastActivity = Date.now()
  }
  const ended = (request: Request) => {
    inflight.delete(request)
    lastActivity = Date.now()
  }

  page.on('request', started)
  page.on('requestfinished', ended)
  page.on('requestfailed', ended)

  await page.waitForRequest((request) =>
    request.url().startsWith(`${LANE_API_ORIGIN}/api/clients/report`),
  )
  await expect
    .poll(() => inflight.size === 0 && Date.now() - lastActivity >= QUIET_MS, {
      message: 'the network went quiet after the first render',
    })
    .toBe(true)
}

const json = (body: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  // An answer to a cross-origin `fetch` needs this, or the browser drops it as a CORS failure,
  // which reads exactly like a refused key. Playwright answers the preflight itself.
  headers: { 'access-control-allow-origin': '*' },
  body: JSON.stringify(body),
})

/**
 * The Turnstile challenge page SahajCloud serves. It hands its parent a token at once, and a fresh
 * one on every `reset` — what a passed, invisible challenge does.
 *
 * ⚠ The channel and the message types are `src/hooks/use-turnstile.ts`'s contract with
 * SahajCloud, restated: change them there and here together, or every registration scenario
 * waits on a token that never arrives.
 */
const CHALLENGE_PAGE = `<!doctype html><meta charset="utf-8"><script>
const params = new URLSearchParams(location.search)
const post = (message) =>
  parent.postMessage({ channel: 'sahaj-atlas-turnstile', ...message }, params.get('parent'))
let solved = 0
const solve = () => post({ type: 'token', token: 'browser-lane-token-' + ++solved })
post({ type: 'ready' })
if (!params.has('probe')) solve()
addEventListener('message', (event) => {
  if (event.data?.channel === 'sahaj-atlas-turnstile' && event.data.type === 'reset') solve()
})
</script>`

/** A 1×1 PNG, for every image the event fixtures name. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

/**
 * The smallest style the widget's map can load: a background, no sources, and a glyph URL for
 * the cluster counts. The app adds its own source and registers its own marker images, so
 * nothing here stands in for anything a spec asserts on.
 */
const MAP_STYLE = {
  version: 8,
  name: 'Browser lane',
  sources: {},
  glyphs: 'mapbox://fonts/sydevadmin/{fontstack}/{range}.pbf',
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#dfe9ec' } }],
}

type Fulfilment = Parameters<Route['fulfill']>[0]

/** The fixture answering one request, or `undefined` to leave it to the catch-all. */
type Answer = (
  url: URL,
  request: Request,
) => Promise<Fulfilment | undefined> | Fulfilment | undefined

const answerSahajCloudRoute: Answer = async (url, request) => {
  if (url.pathname === '/api/atlas/challenge')
    return { contentType: 'text/html', body: CHALLENGE_PAGE }
  if (url.pathname.startsWith('/api/images/file/')) return { contentType: 'image/png', body: PIXEL }

  const answer = answerSahajCloud({
    method: request.method(),
    url,
    authorization: await request.headerValue('authorization'),
  })

  return answer && json(answer.json, answer.status)
}

const answerMapbox: Answer = (url) => {
  if (url.hostname === 'events.mapbox.com') return { status: 204 }
  if (url.hostname !== 'api.mapbox.com') return undefined
  if (url.pathname.startsWith('/styles/v1/')) return json(MAP_STYLE)
  // An empty protobuf is a valid glyph range with no glyphs in it: counts render blank, and
  // nothing in the lane reads them off the canvas.
  if (url.pathname.startsWith('/fonts/v1/')) {
    return { contentType: 'application/x-protobuf', body: Buffer.alloc(0) }
  }
  if (url.pathname.startsWith('/map-sessions/v1')) return json({})

  return undefined
}

// What ipwho.is answers for an address it cannot place. `IpLocationSchema` refuses it, so no
// "classes near you" prompt appears in any scenario.
const answerIpLookup: Answer = () => json({ success: false, message: 'Reserved range' })

const named = (request: Request) => `${request.method()} ${request.url()}`

/**
 * Collects what teardown fails the test on, and hands back the only way to answer a request —
 * so nothing a fixture answered can also be reported as unanswered.
 */
const laneGuards = (context: BrowserContext) => {
  const unrouted: string[] = []
  const crashes: string[] = []
  const answered = new WeakSet<Request>()

  context.on('weberror', (error) => crashes.push(String(error.error())))

  // A request that never reached a handler — one that bypassed interception — cannot resolve
  // a host under `--host-resolver-rules`, so it fails, and lands here. Aborted is a cancelled
  // request (a navigation, the page closing), not an unanswered one.
  context.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? ''
    const external = /^https?:/.test(request.url()) && !request.url().startsWith(LANE_ORIGIN)

    if (external && !answered.has(request) && !/BLOCKED_BY_CLIENT|ABORTED/.test(failure)) {
      unrouted.push(`${named(request)} (${failure})`)
    }
  })

  // ⚠ **`context.route` never sees a WebSocket**, and a refused one fires no
  // `requestfailed`. The review server speaks none, so every socket is one no fixture
  // answers. The page's `websocket` event reports a dedicated Worker's socket too, which
  // `routeWebSocket` (it patches the page's `WebSocket`) never sees.
  const watchSockets = (page: Page) =>
    page.on('websocket', (socket) => unrouted.push(`WebSocket ${socket.url()}`))

  context.pages().forEach(watchSockets)
  context.on('page', watchSockets)

  const routeTo = (answer: Answer) => async (route: Route) => {
    const request = route.request()
    const response = await answer(new URL(request.url()), request)

    if (!response) return route.fallback()

    answered.add(request)
    await route.fulfill(response)
  }

  return { crashes, routeTo, unrouted }
}

export type Lane = {
  /** Answers one SahajCloud API path from `response` for the rest of the test. */
  answerSahajCloud: (path: string, response: { status: number; json: Json }) => Promise<void>
}

export const test = base.extend<{ lane: Lane }>({
  // ⚠ **Auto, so no spec can forget it.** Every request leaving the review server's origin is
  // answered from a fixture or aborted, and a test that made one no fixture answered FAILS at
  // teardown, naming it. A widget that starts reaching for a new host fails here rather than
  // quietly passing on whatever that host happened to answer.
  lane: [
    async ({ context }, use) => {
      const { crashes, routeTo, unrouted } = laneGuards(context)

      // ⚠ **Playwright tries the NEWEST matching route first**, so the catch-all is registered
      // first and only sees what every later handler falls back on.
      await context.route(
        (url) => url.origin !== LANE_ORIGIN,
        async (route) => {
          unrouted.push(named(route.request()))
          await route.abort('blockedbyclient')
        },
      )
      await context.route('https://ipwho.is/**', routeTo(answerIpLookup))
      await context.route(/^https:\/\/[a-z]+\.mapbox\.com\//, routeTo(answerMapbox))
      await context.route(`${LANE_API_ORIGIN}/**`, routeTo(answerSahajCloudRoute))

      await use({
        answerSahajCloud: async (path, response) => {
          await context.route(
            // A predicate rather than a glob: a glob must match the query string too, and every
            // SahajCloud request carries `?locale=`.
            (url) => url.origin === LANE_API_ORIGIN && url.pathname === `/api${path}`,
            routeTo(() => json(response.json, response.status)),
          )
        },
      })

      expect(unrouted, 'requests no fixture answered').toEqual([])
      expect(crashes, 'uncaught errors in the page').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
