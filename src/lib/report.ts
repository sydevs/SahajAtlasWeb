import type { Report } from '@/types/report'

// This imports the module directly, not the `shape` barrel.
// The barrel would pull every codec into this file's graph.
// This file is part of the eager payload.
import { routeFromParam } from './shape/routing'

/**
 * Narrows an unknown thrown value to a displayable message.
 *
 * A rejection is not always an `Error`. A thrown string or a plain object would make
 * `error.message` render as `undefined`. It could also throw inside an error fallback.
 * React cannot recover from a throw there. Both fallbacks call this function. This keeps
 * the screen text and the report's `error` field in sync for the same failure, instead
 * of one side silently showing a generic line.
 *
 * The function returns `undefined` when there is nothing useful to show. The caller then
 * supplies its own localized generic sentence.
 */
export function errorMessage(error: unknown): string | undefined {
  if (error == null) return undefined
  if (typeof error === 'string') return error || undefined

  // Everything below can throw on a hostile value. Examples: a throwing `message`
  // getter, a null-prototype object, or a throwing `toString`/`Symbol.toPrimitive`.
  // Both callers render this result inside an error boundary's own fallback. A throw
  // there is unrecoverable. It would blank the whole widget on the host page. So this
  // function must never throw. Anything it cannot read becomes `undefined`. The caller
  // then falls back to its own generic line.
  try {
    if (typeof error === 'object' && 'message' in error) {
      const { message } = error as { message: unknown }

      return typeof message === 'string' && message ? message : undefined
    }

    const text = String(error)

    // `String({})` produces "[object Object]". This is noise on screen, and it is
    // worse than useless as report context. Treat it as nothing to show.
    return text && text !== '[object Object]' ? text : undefined
  } catch {
    return undefined
  }
}

// ── Failure classification (issue #89) ──────────────────────────────────────────

/**
 * What kind of failure reached an error boundary.
 *
 * The point is not diagnosis. The point is deciding what to say and what to offer.
 * A retry is a lie for a region that does not exist. "See nearby events" is a lie
 * for a dropped connection. Asking a viewer to report their own offline state
 * wastes everyone's time.
 */
export type ErrorKind =
  | 'offline'
  | 'server'
  | 'not-found'
  | 'config'
  | 'captcha-blocked'
  | 'unknown'

/**
 * Throws a failure that already knows its own kind.
 *
 * Every `throw` this codebase writes goes through this function. `classifyError` then
 * reads a field, instead of pattern-matching our English. The alternative — regexing
 * "Region not found:" back out of the message — turns a developer string into a
 * contract. Reword that string, and every dead-region link silently degrades to
 * `unknown`. Lint, typecheck, and the unit lane all stay green anyway. This follows the
 * same reasoning as `RegistrationRefusedError` (`src/config/api/mutate.ts`), which
 * carries a code instead of trusting prose.
 *
 * The message stays free-form. It exists for us, in a report, never for the screen.
 */
export const atlasError = (kind: ErrorKind, message: string): Error =>
  Object.assign(new Error(message), { kind })

// This lists the valid kinds as a set. A stray `{ kind: 'whatever' }` from a host page
// or a third-party rejection cannot pass as a valid classification.
const ERROR_KINDS: Record<ErrorKind, true> = {
  offline: true,
  server: true,
  'not-found': true,
  config: true,
  'captcha-blocked': true,
  unknown: true,
}

// This checks an OWN property, not `in`. The `in` operator walks the prototype chain,
// so `{ kind: 'toString' }` would pass. `classifyError` would then return a "kind" with
// no policy behind it, which means an error screen with no message and no buttons.
// This uses `hasOwnProperty.call` instead of `Object.hasOwn` (ES2022), because the
// widget can run in any browser the host page opens in.
const isErrorKind = (value: unknown): value is ErrorKind =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(ERROR_KINDS, value)

// Native `fetch` rejects with a TypeError, and the wording differs per engine
// ("Failed to fetch" / "NetworkError when attempting to fetch resource." / "Load
// failed"). This check matches the wording as well as the type. A TypeError is just as
// often our own bug, and a programming error deserves the report action that `offline`
// suppresses.
const NETWORK_MESSAGE = /failed to fetch|networkerror|network request failed|load failed/i

/**
 * Narrows an unknown thrown value to the kind of failure it represents.
 *
 * This runs inside an error fallback, like `errorMessage` above. So it must never
 * throw. A hostile value — a throwing getter, or a null-prototype object — resolves to
 * `unknown` instead of blanking the widget on someone else's page.
 *
 * Order matters here. Our own tag wins outright. An HTTP status comes next, because it
 * proves a server answered. That outranks anything `navigator.onLine` claims.
 * `navigator.onLine` comes last, as the weakest signal. It reports only whether the
 * machine has a link, not whether this request could travel it.
 */
export function classifyError(error: unknown): ErrorKind {
  try {
    // One read covers both duck-typed shapes: our tag, and a PayloadSDKError's
    // status. This code avoids `instanceof` everywhere. `instanceof` fails across
    // realms, such as an iframe or a worker, and the widget runs inside host pages
    // we do not own.
    const { kind, status, name } =
      typeof error === 'object' && error !== null
        ? (error as { kind?: unknown; status?: unknown; name?: unknown })
        : {}

    if (isErrorKind(kind)) return kind

    if (typeof status === 'number') {
      if (status === 401 || status === 403) return 'config'
      if (status === 404) return 'not-found'
      if (status >= 500) return 'server'
    }

    // A zod parse failure — SahajCloud's shape drifting from ours — used to be its own
    // `contract` kind. It maps to `unknown` now. The two kinds differed only in
    // offering a retry, and a drift deserves a retry for the same reason any
    // unrecognised failure does: a partial deploy, a cached response, or a transient
    // upstream shape. The old distinction named a cause the viewer cannot act on. The
    // report carries the thrown message, and a cause belongs there instead.

    // Only the browser can say the viewer is offline. `fetch` rejects with the same
    // TypeError for several different causes: a dropped connection, a DNS failure,
    // SahajCloud being down, a rejected CORS preflight, or a host page whose CSP omits
    // `connect-src`. "You appear to be offline" would blame the wrong party in the
    // last four cases. It would also block the report action, since `offline`
    // suppresses it, leaving no way to tell us about a cause that is ours or the
    // host's. So a network TypeError reads as `server`, unless the browser confirms
    // the machine is offline.
    const seemsOffline = typeof navigator !== 'undefined' && navigator.onLine === false
    const message = errorMessage(error)

    if (name === 'TypeError' && message && NETWORK_MESSAGE.test(message)) {
      return seemsOffline ? 'offline' : 'server'
    }

    if (seemsOffline) return 'offline'

    return 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * How the widget's own console output identifies itself in a host page's log, which is
 * full of somebody else's lines. This string matches the custom element's tag name,
 * but it serves a different purpose: this one is a log prefix. `Widget.tsx` owns the
 * element name.
 */
const LOG_PREFIX = 'sahaj-atlas'

// ── Automatic error reporting (issue #108) ──────────────────────────────────────

/**
 * Which classified kinds earn a Sentry event.
 *
 * Not every failure a boundary renders is news. Two kinds stay deliberately silent,
 * for reasons `ERROR_POLICY` already applies wherever a *viewer* can see them:
 *
 *  - **`offline`** — the browser itself says there is no link. Nothing on our side is
 *    broken, and the POST that would carry the news needs the same network that just
 *    failed. This matches the reasoning that withholds the report action from a
 *    viewer here: asking anyone, a person or a beacon, to report their own dropped
 *    connection spends an attempt that cannot arrive.
 *  - **`not-found`** — a dead link is not a malfunction. These are somebody's stale
 *    bookmark, or a region unpublished in the CMS. A project that fills up with other
 *    people's expired URLs becomes a project nobody reads. This is why the viewer
 *    sees the neutral register instead of the danger one.
 *
 * The three remaining kinds are ones a maintainer can act on. **`server`** means
 * SahajCloud is down, or a CORS/CSP block is being reported as one. **`config`** means
 * a customer's API key is wrong or expired, so their embed is dead on arrival.
 * **`unknown`** is ours: a render crash, a schema drift, or a refused link.
 *
 * Each row here is one line to flip, on purpose. If a 404 spike ever turns out to be
 * our own routing bug rather than the world's stale links, this is where that gets
 * decided, not in a condition spelled out elsewhere in the call path.
 */
const REPORTED_KINDS: Record<ErrorKind, boolean> = {
  offline: false,
  'not-found': false,
  server: true,
  config: true,
  // This is withheld for the same reason as `offline`, one layer along. The report
  // POST is itself Turnstile-gated, so the one channel that would carry this failure
  // is the channel that just failed. `ERROR_POLICY` makes the same call wherever a
  // viewer can see it, by offering no report action on this row.
  'captcha-blocked': false,
  unknown: true,
}

/**
 * How this module talks to the loaded SDK. This is one function wide, so nothing
 * above the seam ever holds a Sentry object. The import's shape stays a local
 * concern.
 */
type Reporter = (error: unknown, kind: ErrorKind, context: string) => void

/**
 * The load, memoized for the life of the page. `undefined` means never attempted. A
 * promise that resolves to `null` means the load was attempted and is unavailable.
 * The code remembers this on purpose (see `captureError`).
 */
let reporterLoad: Promise<Reporter | null> | undefined

/**
 * A hard ceiling on events per page load, and a count of how many have gone.
 *
 * `dedupeIntegration` collapses identical repeats, such as the `Link`-per-row case.
 * It compares only against the previous event, so a screen failing several different
 * ways in a loop slips straight through it. The two mechanisms do not do one job.
 * Dedupe is about accuracy: one issue, not fifty. This cap is the absolute bound.
 *
 * The cap matters more here than in an app that owns its page. A runaway render loop
 * on somebody else's site would spend their visitor's bandwidth and our quota. The
 * first few events already say everything the fiftieth would.
 */
const MAX_EVENTS_PER_PAGE = 10
let sent = 0

/**
 * The DSN, if reporting is live at all. This reads the value per call, rather than
 * once at module load.
 *
 * An absent `VITE_SENTRY_DSN` is the default posture, and the important one. The
 * `import()` below is then never reached, so the SDK is never fetched. The behaviour
 * then matches exactly the console-only behaviour this seam had before. The host veto
 * that used to sit beside it is gone (#149). Reports now carry no cookies, no
 * breadcrumbs, and no session replay, and the host page reaches Sentry as origin and
 * path only.
 */
function reportingDsn(): string | null {
  const dsn = import.meta.env.VITE_SENTRY_DSN

  return typeof dsn === 'string' && dsn ? dsn : null
}

/**
 * Builds the reporter. It fetches the SDK, sets up a client, and hands back the one
 * call.
 *
 * **This builds a `BrowserClient` on a private `Scope`, deliberately, not
 * `Sentry.init`.** `init` installs global `onerror`/`onunhandledrejection` handlers on
 * the page, and this widget lives inside somebody else's page. It would capture the
 * host's unrelated exceptions into our project: their bugs in our issue list, their
 * quota spend on our plan, their inline script's stack trace on our servers. A client
 * bound to a scope we own captures only the errors we hand it. This also makes it the
 * leanest shape. Sentry's own docs describe this same pattern for tree-shaking.
 */
async function loadReporter(dsn: string): Promise<Reporter | null> {
  // This import is dynamic on purpose. `report.ts` sits in the eager graph: App,
  // Widget, the Link atom, and every fallback import it. A static import would put
  // the whole SDK in front of first paint, for the vast majority of sessions that
  // never fail. This way, only a visitor already looking at a broken widget pays for
  // it.
  const {
    BrowserClient,
    Scope,
    dedupeIntegration,
    defaultStackParser,
    linkedErrorsIntegration,
    makeFetchTransport,
  } = await import('@sentry/browser')

  // Whether the ingest endpoint has refused us. See the transport below. This latch
  // is what makes "one blocked request, not one per error" true.
  let refused = false

  const client = new BrowserClient({
    dsn,
    /**
     * The fetch transport, wrapped so the first refusal is the last attempt.
     *
     * Sentry's own transport does not learn from a blocked request. It records a
     * `network_error` outcome and rethrows. `Client.sendEnvelope` catches that and
     * returns `{}`. Its only back-off state comes from `X-Sentry-Rate-Limits` on a
     * *response*, and a request the host's CSP blocked never produces one. Without
     * this wrapper, a host whose `connect-src` omits the ingest origin would get one
     * blocked request and one browser CSP-violation error in their console, for
     * every reported failure, for the life of the page.
     *
     * That is exactly the noise this seam exists to avoid. It is also a promise the
     * README makes to integrators: declining the origin costs them nothing. This
     * latch is what makes that promise true.
     */
    transport: (options) => {
      // The second argument matters on a page we do not own. Left off, the
      // transport calls `getNativeImplementation('fetch')`. If anything on the
      // host has wrapped `window.fetch`, as every analytics and consent script
      // does, that call creates a hidden iframe in their `<head>` to recover a
      // clean copy. It repeats this on every failed send. Passing the page's own
      // `fetch` keeps us out of their DOM. A wrapped fetch is not our problem to
      // route around.
      const inner = makeFetchTransport(options, (...args) => fetch(...args))

      return {
        ...inner,
        send: (envelope) => {
          if (refused) return Promise.resolve({})

          return Promise.resolve(inner.send(envelope)).catch(() => {
            refused = true

            return {}
          })
        },
      }
    },
    stackParser: defaultStackParser,
    environment: import.meta.env.MODE,
    // This value is explicit, not inherited. `false` is already the default. But
    // this file's whole posture treats what we do not send as a decision, not an
    // accident.
    sendDefaultPii: false,
    // This applies the same cap the human report uses for a thrown message, for
    // the same reason, now from one place. `exception.value` is otherwise
    // uncapped: v10's `applyClientOptions` truncates only `if (maxValueLength)`,
    // and there is no default. A thrown message is not always ours. Engines build
    // their own, sometimes out of the very URL this file is careful never to send.
    maxValueLength: MAX_ERROR_LENGTH,
    // Both settings below override a default that reaches outside the widget. That
    // is the one class of default a thing embedded in someone else's page cannot
    // accept:
    //
    //  - `release` defaults to `window.SENTRY_RELEASE?.id`, a global that belongs
    //    to the host. A site running its own Sentry would silently stamp every one
    //    of our events with their release version. Our issues would then claim to
    //    come from a deploy that is not ours. **This value stays pinned to
    //    nothing now that source maps upload (#130), not despite that.** Frames
    //    resolve by debug ID, which the bundler plugin injects into each chunk and
    //    its map. Symbolication needs no release, so this hazard stays shut. A
    //    release string would also be the wrong identity here even if it were
    //    free. #143 settled that this repo deploys evergreen, and its
    //    `package.json` version is "a marker, not a contract": many distinct
    //    builds share one version, while each has its own debug IDs.
    //    `vite.config.ts` therefore also sets `release.inject: false`. The
    //    plugin's default would write that same global onto the host page, which
    //    is this same bullet in reverse.
    //
    //    This has a load-bearing consequence for `beforeSend` below: it must keep
    //    `debug_meta`. `prepareEvent` fills that field from the injected debug IDs
    //    before the hook runs. Deleting it, or converting this delete-list into a
    //    true allowlist without carrying the field across, would silently
    //    un-symbolicate every frame while every gate stayed green. See the note on
    //    the hook itself.
    //  - `sendClientReports` defaults to true, which posts a periodic outcome
    //    summary to the ingest endpoint when the page is hidden. This is SDK
    //    bookkeeping we have no use for. It would also turn one crash into a
    //    second, uninvited request from their page.
    release: undefined,
    sendClientReports: false,
    // **This list is explicit and minimal. It is required, and not for the reason
    // it looks like.**
    //
    // A reader might assume this means "defaults off". It does not.
    // `getDefaultIntegrations` runs inside `Sentry.init`, and a bare `new
    // BrowserClient(...)` never installs a default integration at all. What makes
    // the option load-bearing is that `Client.init` runs
    // `this._options.integrations.some(...)`, which throws on `undefined`. That
    // throw would happen inside a fallback, where a throw blanks the widget.
    //
    // So nothing here is suppressed. The two entries below are chosen on purpose.
    // Each is a pure event processor that touches nothing on the host page:
    //
    //  - `dedupe` — the seam is now called from render bodies. `Link` reports a
    //    refused href while rendering, so one malformed `webPath` in a
    //    search-results list becomes one event per row, per render pass. That cost
    //    nothing while this stayed console-only.
    //  - `linkedErrors` — walks `error.cause`. Without it, the chain is dropped.
    //    That chain carries most of the diagnostic value whenever a foreign
    //    failure is rethrown as ours.
    //
    // We still decline everything that reaches outside the widget, and none of it
    // is reachable from here anyway. `GlobalHandlers` would hook the host's own
    // error events. `Breadcrumbs` would record their console output, their DOM
    // clicks, and the full URL of every fetch their page makes. `HttpContext`
    // would set `request.url` from `location.href`, the one string `hostPageUrl`
    // exists to avoid.
    integrations: [dedupeIntegration(), linkedErrorsIntegration()],
    beforeSend: (event, hint) => {
      // **This scrubs the carriers a host could have written to.** The scope we
      // capture on is not as private as `new Scope()` makes it look.
      // `getCombinedScopeData` always merges `getGlobalScope()`, and the global
      // carrier is keyed by the SDK's *version string*. A host page running this
      // same `@sentry/browser` version shares that carrier with us. Their
      // `setTag`/`setExtra`/`setContext` calls would then ride out on our events,
      // and ours on theirs. #95 found this same cross-tenant contamination
      // between two Fathom trackers, one layer down.
      //
      // Dropping `extra` closes a second hole on its own. A thrown plain object
      // serializes into it wholesale, so anything a caller threw instead of an
      // `Error` would leave the page in full.
      //
      // **This is a delete-list. Calling it an allowlist, as this comment did
      // until #130, is a false claim that outlives the person who wrote it.**
      // `tags` and `request` below really are rebuilt from scratch. Everything
      // else is deleted by name, so any field neither we nor this list
      // anticipated still travels. A true allowlist is the stronger form, and it
      // remains the right eventual shape. This file does not attempt one, on
      // purpose: #130 is a build-plumbing ticket, and enumerating the fields an
      // event legitimately needs (`event_id`, `timestamp`, `platform`, `sdk`,
      // `exception`, `level`, `environment`, `debug_meta`, …) is a change to the
      // seam. That change deserves its own ticket and its own review, not a
      // drive-by.
      //
      // **What that means today: `debug_meta` survives because nothing deletes
      // it, and source-map symbolication depends on exactly that.**
      // `prepareEvent` fills it from the debug IDs the bundler injected, before
      // this hook runs. Whoever converts this to a real allowlist must carry
      // `debug_meta` across. Otherwise every production frame silently stops
      // resolving while every gate stays green. `report.sentry.test.ts` fails if
      // the field stops surviving. That spec is the guard, not this paragraph.
      event.tags = {
        'atlas.kind': event.tags?.['atlas.kind'],
        'atlas.context': event.tags?.['atlas.context'],
        'atlas.route': event.tags?.['atlas.route'],
      }
      delete event.user
      delete event.extra
      delete event.contexts
      delete event.breadcrumbs

      // This sets `request.url` rather than deleting it. The host page is the
      // most useful field on the event, and `hostPageUrl` is the form we are
      // allowed to have: origin and path, never the query or fragment. On
      // somebody else's site, that query or fragment can carry a
      // password-reset token, an OAuth `#access_token`, or an email address.
      // One policy, two paths out (see the docblock on `hostPageUrl` below).
      //
      // The in-widget route used to be lost here, because it lived in the
      // fragment and this line strips the fragment. Since #154 it lives in the
      // query, which this line strips too. So the loss became total instead of
      // incidental, and the follow-up this comment used to promise is now
      // `atlas.route` below. That route is ours, not the host's, which is the
      // whole reason it may be sent when their query may not.
      event.request = { url: hostPageUrl() }

      // Attachments are appended after this hook, so nothing above can delete
      // one. Only the host could have set it, since we never attach, and that
      // is exactly why it goes.
      if (hint) hint.attachments = []

      return event
    },
  })

  const scope = new Scope()

  scope.setClient(client)
  client.init()

  return (error, kind, context) => {
    // This clones a child scope per event. Tags set on the shared scope persist,
    // so a session's second failure would otherwise arrive wearing the first
    // one's kind. A mislabelled event is worse than an unlabelled one.
    const event = scope.clone()

    event.setTag('atlas.kind', kind)
    event.setTag('atlas.context', context)
    event.setTag('atlas.route', widgetRoute())
    event.captureException(error)
  }
}

/**
 * The widget's own route, for a crash report, or `undefined` when there is not one.
 *
 * **This is the one part of the URL that is ours to send.** `hostPageUrl` reduces the
 * page to origin plus path, precisely because a host's query can carry a reset token
 * or an email address. The widget's route rides in that same query, so it gets
 * stripped with everything else. Reading it back out by name restores the diagnostic
 * without restoring the leak: `?atlas=/nl/amsterdam/1204` is a route we generated, and
 * nothing else in the query is touched.
 *
 * This function is guarded, and it returns a route or nothing, because it runs while
 * something is already broken. `routeFromParam` refuses anything that is not a
 * site-relative path, so a hostile value on the link cannot ride out on our telemetry
 * either.
 */
function widgetRoute(): string | undefined {
  try {
    return routeFromParam(window.location.search)
  } catch {
    return undefined
  }
}

/**
 * Hands a classified failure to Sentry, if there is anything to hand it to.
 *
 * The caller never awaits this, and it never throws. The caller sits inside an error
 * fallback. There, an uncaught rejected promise becomes an unhandled rejection in the
 * host's console, and a throw blanks the widget on their page.
 */
function captureError(error: unknown, kind: ErrorKind, context: string): void {
  const dsn = reportingDsn()

  if (!dsn || !REPORTED_KINDS[kind] || sent >= MAX_EVENTS_PER_PAGE) return

  sent += 1

  // This remembers the failure too, not just the success. A host whose CSP omits
  // the ingest origin, or whose network drops the chunk, fails this import every
  // time. Retrying on every error would turn one broken screen into a stream of
  // blocked requests, and exactly the console noise this seam exists to avoid. One
  // attempt gets one answer, for the life of the page.
  reporterLoad ??= loadReporter(dsn).catch(() => null)

  reporterLoad.then((send) => send?.(error, kind, context)).catch(() => {})
}

/**
 * Records a failure the widget has already absorbed (issues #89, #108).
 *
 * This function began as "a failure while rendering an error state". It covers more
 * now. Since #108, every ErrorBoundary reports through here, via
 * `ResetErrorBoundary`. A handful of imperative callers also report through here when
 * they swallow something and carry on: a refused `Link` href, a fragment the host
 * would not let us claim, a recovery ladder that could not resolve a rung.
 *
 * One thing unites all of them: each one has already degraded gracefully, so nothing
 * here may throw. But a swallowed failure no one ever sees is how a broken recovery
 * path survives for months. This seam keeps both properties true.
 *
 * **This is the single call site the error reporter is wired into** (issue #108).
 * That is what the original promise here bought: Sentry arrived by changing this
 * function and nothing else, and `@sentry/browser` is imported from exactly one place
 * in the repo. Callers still just say what went wrong and where. The seam decides the
 * failure's kind (`classifyError`), whether that kind is worth an event
 * (`REPORTED_KINDS`), and what may travel with it.
 *
 * The console line is unconditional, and it comes first. It is the only signal on a
 * build with no DSN, on a host that has declined reporting, or on a developer's
 * machine. **Its level follows the same table that decides what is worth an event.**
 * The console it writes to belongs to the host. Now that every boundary reports, a
 * dead link would otherwise put a red error in a stranger's log for something we have
 * already called not a malfunction. Saying "not news" to Sentry and "error" to them
 * would be the same judgment pointing two ways.
 *
 * Both halves are guarded, in both directions. A host page is free to replace
 * `console.error` with something that throws, and that must not cost us the report. A
 * reporting failure must not cost us the line in their log. Neither failure may reach
 * the caller, because every caller has already absorbed the original one.
 */
export function reportInternalError(error: unknown, context: string): void {
  // This classifies the error once and shares the result. `classifyError` never
  // throws, since it guards its own body. Computing it twice could let the log and
  // the event disagree about what happened.
  const kind = classifyError(error)

  try {
    // This uses two calls, not one computed member, because `no-console` allows
    // `warn`/`error` only by name. A `console[level]` form reads as a banned
    // `console.log` to the rule, and fails the lint gate.
    const line = `[${LOG_PREFIX}] ${context}`

    if (REPORTED_KINDS[kind]) console.error(line, error)
    else console.warn(line, error)
  } catch {
    // Nothing left to do. A logger that throws is not worth a second attempt.
  }

  try {
    captureError(error, kind, context)
  } catch {
    // Nothing left to do, for the same reason. `captureError` is written not to
    // throw. This line is a guarantee, not merely an expectation.
  }
}

/**
 * Records a host-side integration mistake: the embed script included twice, or a
 * second `<sahaj-atlas>` element on one page (issue #92).
 *
 * This uses the same seam as `reportInternalError`, at a lower severity. It uses
 * `warn` instead of `error`, because nothing is broken. The widget merely declined to
 * do something twice.
 *
 * **This stays console-only, and that is a decision, not an omission** (issue #108).
 * These are the most tempting cases in the file to send. Each one produces a widget
 * that renders nothing on a real customer's page, while every gate in this repo stays
 * green. They are sent to nobody anyway, for two reasons that survive wanting the
 * data:
 *
 *  - **They fire before the host has been asked.** The duplicate-script warning runs
 *    at module load, from the `customElements.define` guard. The duplicate-element
 *    one runs from `connectedCallback`. Both can fire before `<sahaj-atlas>`'s
 *    attributes have been read. A beacon here could therefore leave a page whose
 *    owner had set `error-reporting="false"`, and #95's posture says we do not do
 *    that. An opt-out you can outrun is not an opt-out.
 *  - **This is a misconfiguration, not a crash, and it recurs per pageview.** A
 *    doubled embed on a busy page would post one event on every single load,
 *    indefinitely, with no host-side way to stop it. The reader who can actually fix
 *    it is whoever installed the embed, and that reader already has the console line.
 *
 * If this blind spot proves real, the fix is to queue these warnings and flush them
 * once the privacy attributes have been read, not to drop the gate.
 *
 * This is guarded the same way: a host is free to replace `console.warn` with
 * something that throws, and the mount path must not die while telling somebody about
 * itself.
 */
export function reportIntegrationWarning(message: string): void {
  try {
    console.warn(`[${LOG_PREFIX}] ${message}`)
  } catch {
    // Nothing left to do. A logger that throws is not worth a second attempt.
  }
}

/**
 * The context auto-attached to every issue report: everything the viewer should not
 * have to type. This assembles from the widget's own route plus the host page's
 * globals, so a report arrives with enough detail to reproduce it (issue #79).
 */
export type ReportContext = {
  /** The in-widget route (`location.pathname`), e.g. `/india/pune/e/42`. */
  path: string
  /** The host page the widget is embedded in (`window.location.href`). */
  pageUrl: string
  /** The active UI locale. */
  locale: string
  /** The API client's name, so a report lands identified with the site it came from. */
  client?: string
  /** The browser string, for reproducing rendering / CSP-specific breakage. */
  userAgent: string
  /** Whatever was thrown, when the report was opened from an error CTA. */
  error?: string
}

export type ReportContextInput = {
  path: string
  locale: string
  client?: string | null
  error?: string | null
  /** Injectable so the node test lane — and a server render — can build one without a DOM. */
  pageUrl?: string
  userAgent?: string
}

/**
 * The host page, as origin plus path only.
 *
 * This deliberately avoids `location.href`. The widget is embedded on sites we do not
 * control, and a host's own query or fragment can carry a password-reset token, an
 * OAuth `#access_token`, or an email address. A report is emailed onward to admins
 * (#80), so anything captured here lands in mailboxes and logs under a far weaker
 * posture than the page it came from. Nothing diagnostic is lost. The in-widget route
 * travels separately, as `path`.
 */
const hostPageUrl = () => {
  if (typeof window === 'undefined') return ''

  try {
    const url = new URL(window.location.href)

    return `${url.origin}${url.pathname}`
  } catch {
    return ''
  }
}

// This reads the global behind a guard. The unit lane runs in node, and a host may
// server-render the widget, so this global is not guaranteed to exist.
const browserAgent = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent)

/**
 * The cap for the thrown message. This text is server-controlled: a zod parse
 * failure serializes every issue and can run to multiple KB. This text also rides
 * along in the payload.
 */
const MAX_ERROR_LENGTH = 500

/**
 * This function is pure, given its inputs. The browser-derived fields default from
 * the live globals, but callers can pass them in instead. This keeps the function
 * testable, and it never throws outside a browser. Blank optional fields are omitted,
 * instead of carried as `null` or `''`, which keeps the payload a readable summary of
 * what is actually known.
 */
export function buildReportContext({
  path,
  locale,
  client,
  error,
  pageUrl = hostPageUrl(),
  userAgent = browserAgent(),
}: ReportContextInput): ReportContext {
  return {
    path,
    pageUrl,
    locale,
    userAgent,
    ...(client ? { client } : {}),
    ...(error ? { error: error.slice(0, MAX_ERROR_LENGTH) } : {}),
  }
}

/**
 * What the report form POSTs to SahajCloud's shared `/api/contact-admin`
 * (sydevs/SahajCloud#602, wired in #103). `api.contactAdmin` maps this onto that
 * endpoint's own body, notably `pageUrl` to `hostUrl`, and clamps each context value
 * to the bound the endpoint enforces.
 */
export type ReportPayload = Report & {
  turnstileToken: string
  context: ReportContext
}
