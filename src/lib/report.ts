import type { Report } from '@/types/report'

/**
 * Narrow an unknown thrown value to a displayable message.
 *
 * A rejection need not be an `Error` — a thrown string, or a plain object, would make
 * `error.message` render `undefined` (or throw inside an error fallback, which React
 * can't recover from). Both fallbacks route through this so the SAME failure produces
 * the same text on screen and the same `error` in a report, rather than one of them
 * silently substituting a generic line.
 *
 * Returns `undefined` when there's nothing meaningful to show, leaving the caller to
 * supply its own localized generic sentence.
 */
export function errorMessage(error: unknown): string | undefined {
  if (error == null) return undefined
  if (typeof error === 'string') return error || undefined

  // Everything below can throw on a hostile value — a throwing `message` getter, a
  // null-prototype object, a throwing `toString`/`Symbol.toPrimitive`. Both callers
  // render this INSIDE an error boundary's own fallback, where a throw is unrecoverable
  // and would blank the whole widget on the host page, so the one thing this must never
  // do is throw. Anything it can't read becomes `undefined` and the caller's generic line.
  try {
    if (typeof error === 'object' && 'message' in error) {
      const { message } = error as { message: unknown }

      return typeof message === 'string' && message ? message : undefined
    }

    const text = String(error)

    // `String({})` is "[object Object]" — noise on screen and worse than useless as
    // report context, so treat it as nothing to show.
    return text && text !== '[object Object]' ? text : undefined
  } catch {
    return undefined
  }
}

// ── Failure classification (issue #89) ──────────────────────────────────────────

/**
 * What kind of failure reached an error boundary. The point isn't diagnosis — it's
 * deciding what to SAY and what to OFFER: a retry is a lie for a region that doesn't
 * exist, "See nearby events" is a lie for a dropped connection, and asking a viewer to
 * report their own offline state wastes everyone's time.
 */
export type ErrorKind = 'offline' | 'server' | 'not-found' | 'config' | 'unknown'

/**
 * Throw a failure that already knows its own kind.
 *
 * Every `throw` we write ourselves goes through this, so `classifyError` reads a field
 * instead of pattern-matching our English. The alternative — regexing "Region not
 * found:" back out of the message — makes a developer string a contract: reword it and
 * every dead-region link silently degrades to `unknown`, with lint, typecheck and the
 * unit lane all still green. Same reasoning as `RegistrationRefusedError`
 * (`src/config/api/mutate.ts`), which carries a code rather than trusting prose.
 *
 * The message stays free-form: it's for us, in a report — never for the screen.
 */
export const atlasError = (kind: ErrorKind, message: string): Error =>
  Object.assign(new Error(message), { kind })

// The valid kinds as a set, so a stray `{ kind: 'whatever' }` reaching us from a host
// page or a third-party rejection can't smuggle itself in as a classification.
const ERROR_KINDS: Record<ErrorKind, true> = {
  offline: true,
  server: true,
  'not-found': true,
  config: true,
  unknown: true,
}

// An OWN-property check, not `in`: `in` walks the prototype chain, so
// `{ kind: 'toString' }` would pass and `classifyError` would return a "kind" with no
// policy behind it — an error screen with no message and no buttons. Spelled via
// `hasOwnProperty.call` rather than `Object.hasOwn` (ES2022) because the widget runs in
// whatever browser the host page is opened in.
const isErrorKind = (value: unknown): value is ErrorKind =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(ERROR_KINDS, value)

// Native `fetch` rejects with a TypeError whose wording differs per engine ("Failed to
// fetch" / "NetworkError when attempting to fetch resource." / "Load failed"). Matched
// on the wording as well as the type, because a TypeError is just as often OUR bug —
// and a programming error deserves the report CTA that `offline` suppresses.
const NETWORK_MESSAGE = /failed to fetch|networkerror|network request failed|load failed/i

/**
 * Narrow an unknown thrown value to the kind of failure it represents.
 *
 * Runs INSIDE an error fallback, so — like `errorMessage` above — the one thing it must
 * never do is throw: a hostile value (a throwing getter, a null-prototype object) is
 * `unknown`, not an unrecoverable blank widget on someone else's page.
 *
 * Order matters. Our own tag wins outright. Then an HTTP status, because it proves a
 * server answered — which outranks anything `navigator.onLine` claims. `navigator.onLine`
 * is last, as the weakest signal: it reports whether the machine has a link, not whether
 * this request could have travelled it.
 */
export function classifyError(error: unknown): ErrorKind {
  try {
    // One read covers both duck-typed shapes: our tag and a PayloadSDKError's status.
    // `instanceof` is avoided throughout — it fails across realms (an iframe, a worker),
    // and the widget runs inside host pages we don't own.
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

    // A zod parse failure — SahajCloud's shape drifted from ours — used to be its own
    // `contract` kind. It is `unknown` now: the two differed only in offering a retry,
    // and a drift is worth retrying for the same reason anything unrecognised is (a
    // partial deploy, a cached response, a transient upstream shape). The distinction
    // named a CAUSE the viewer can't act on, and the report — which carries the thrown
    // message — is where a cause belongs.

    // Only the BROWSER can say the viewer is offline. `fetch` rejects with the same
    // TypeError for a dropped connection, a DNS failure, SahajCloud being down, a
    // rejected CORS preflight, and a host page whose CSP omits `connect-src` — and
    // "You appear to be offline" both blames the wrong party and (since `offline`
    // suppresses the report CTA) leaves no way to tell us about the three that are
    // ours or the host's. So a network TypeError is `server` unless the browser agrees.
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
 * full of somebody else's. Same string as the custom element's tag name, but a different
 * fact: this one is a log prefix, and `Widget.tsx` owns the element name.
 */
const LOG_PREFIX = 'sahaj-atlas'

// ── Automatic error reporting (issue #108) ──────────────────────────────────────

/**
 * Which classified kinds earn a Sentry event.
 *
 * Not every failure a boundary renders is news, and two are deliberately silent for
 * reasons `ERROR_POLICY` already acts on where a *viewer* can see them:
 *
 *  - **`offline`** — the browser itself says there is no link. Nothing on our side is
 *    broken, and the POST that would carry the news needs the network that just failed.
 *    It is the same reasoning that withholds the report CTA from a viewer here: asking
 *    anyone — a person or a beacon — to tell us about their own dropped connection
 *    spends an attempt that cannot arrive.
 *  - **`not-found`** — a dead link is not a malfunction. These are somebody's stale
 *    bookmark or a region unpublished in the CMS, and a project filling up with other
 *    people's expired URLs is a project nobody reads. It is why the viewer gets the
 *    neutral register rather than the danger one.
 *
 * The three that remain are the ones a maintainer can act on: **`server`** (SahajCloud is
 * down — or a CORS/CSP block is being reported as one), **`config`** (a customer's API key
 * is wrong or expired, so their embed is dead on arrival), and **`unknown`** (ours — a
 * render crash, a schema drift, a refused link).
 *
 * A row here is one line to flip, on purpose. If a 404 spike ever turns out to be our own
 * routing rather than the world's stale links, this is where that gets decided — not in a
 * condition spelled out somewhere in the call path.
 */
const REPORTED_KINDS: Record<ErrorKind, boolean> = {
  offline: false,
  'not-found': false,
  server: true,
  config: true,
  unknown: true,
}

/**
 * How this module talks to the loaded SDK — one function wide, so nothing above the seam
 * ever holds a Sentry object and the import's shape stays a local concern.
 */
type Reporter = (error: unknown, kind: ErrorKind, context: string) => void

/**
 * The load, memoized for the life of the page. `undefined` — never attempted; a promise
 * resolving to `null` — attempted and unavailable, which is remembered on purpose (see
 * `captureError`).
 */
let reporterLoad: Promise<Reporter | null> | undefined

/**
 * A hard ceiling on events per page load, and how many have gone.
 *
 * `dedupeIntegration` collapses the identical repeats — the `Link`-per-row case — but it
 * compares against the PREVIOUS event only, so a screen failing several different ways in
 * a loop slips straight through it. The two are not the same mechanism doing one job:
 * dedupe is about accuracy (one issue, not fifty), this is the absolute bound.
 *
 * It matters more here than in an app that owns its page. A runaway render loop on
 * somebody else's site would spend their visitor's bandwidth and our quota, and the first
 * few events already say everything the fiftieth would.
 */
const MAX_EVENTS_PER_PAGE = 10
let sent = 0

/**
 * The DSN, if reporting is live at all — read per call rather than once at module load.
 *
 * An absent `VITE_SENTRY_DSN` is the default posture and the important one: the `import()`
 * below is then never reached, so the SDK is never fetched and the behaviour is exactly
 * the console-only one this seam had before. The host veto that used to sit beside it is
 * gone (#149) — reports carry no cookies, no breadcrumbs, no session replay, and the host
 * page reaches Sentry as origin and path only.
 */
function reportingDsn(): string | null {
  const dsn = import.meta.env.VITE_SENTRY_DSN

  return typeof dsn === 'string' && dsn ? dsn : null
}

/**
 * Build the reporter: fetch the SDK, stand up a client, and hand back the one call.
 *
 * **A `BrowserClient` on a private `Scope`, deliberately — NOT `Sentry.init`.** `init`
 * installs global `onerror` / `onunhandledrejection` handlers on the page, and this widget
 * lives in somebody else's. It would capture the HOST's unrelated exceptions into our
 * project: their bugs in our issue list, their quota spend on our plan, their inline
 * script's stack trace on our servers. A client bound to a scope we own captures the
 * errors we hand it and nothing else, which is also what makes it the leanest shape —
 * Sentry documents this same pattern for tree-shaking.
 */
async function loadReporter(dsn: string): Promise<Reporter | null> {
  // Dynamic on purpose. `report.ts` is in the eager graph — App, Widget, the Link atom and
  // every fallback import it — so a static import would put the whole SDK in front of
  // first paint for the overwhelming majority of sessions that never fail. This way the
  // only visitor who pays for it is one already looking at a broken widget.
  const {
    BrowserClient,
    Scope,
    dedupeIntegration,
    defaultStackParser,
    linkedErrorsIntegration,
    makeFetchTransport,
  } = await import('@sentry/browser')

  // Whether the ingest endpoint has refused us. See the transport below: this is the
  // latch that makes "one blocked request, not one per error" true.
  let refused = false

  const client = new BrowserClient({
    dsn,
    /**
     * The fetch transport, wrapped so that the FIRST refusal is the last attempt.
     *
     * Sentry's own transport does not learn from a blocked request. It records a
     * `network_error` outcome and rethrows; `Client.sendEnvelope` catches that and returns
     * `{}`. The only back-off state it keeps comes from `X-Sentry-Rate-Limits` on a
     * *response* — and a request the host's CSP blocked never produces one. So without
     * this, a host whose `connect-src` omits the ingest origin would get one blocked
     * request AND one browser CSP-violation error in their console for every reported
     * failure, for the life of the page.
     *
     * That is precisely the noise this seam exists to avoid, and it is a promise the
     * README makes to integrators — that declining the origin costs them nothing. The
     * latch is what makes the promise true.
     */
    transport: (options) => {
      // The second argument matters on a page we don't own. Left off, the transport calls
      // `getNativeImplementation('fetch')`, which — if anything on the host has wrapped
      // `window.fetch`, as every analytics and consent script does — creates a HIDDEN
      // IFRAME in their `<head>` to salvage a pristine one, and does it again on each
      // failed send. Handing it the page's `fetch` keeps us out of their DOM; a wrapped
      // fetch is not our problem to route around.
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
    // Explicit rather than inherited: `false` is already the default, but the whole
    // posture of this file is that what we do NOT send is a decision, not an accident.
    sendDefaultPii: false,
    // The SAME cap the human report applies to a thrown message, for the same reason and
    // now from one place. `exception.value` is otherwise uncapped — v10's
    // `applyClientOptions` truncates only `if (maxValueLength)`, and there is no default —
    // and a thrown message is not always ours: engines build their own, sometimes out of
    // the very URL we are careful never to send (see `claimFragment` in `Widget.tsx`).
    maxValueLength: MAX_ERROR_LENGTH,
    // Both of these override a default that reaches OUT of the widget, which is the one
    // class of default a thing embedded in someone else's page cannot accept:
    //
    //  - `release` defaults to `window.SENTRY_RELEASE?.id` — a global belonging to the
    //    HOST. A site running its own Sentry would silently stamp every one of our events
    //    with THEIR release version, so our issues would claim to come from a deploy that
    //    isn't ours. **It stays pinned to nothing now that source maps upload (#130), not
    //    despite that** — frames resolve by DEBUG ID, which the bundler plugin injects into
    //    each chunk and its map, so symbolication needs no release and this hazard stays
    //    shut. A release string would also be the wrong identity here even if it were free:
    //    #143 settled that this repo deploys evergreen and its `package.json` version is
    //    "a marker, not a contract", so many distinct builds share one version while each
    //    has its own debug IDs. `vite.config.ts` therefore also sets `release.inject: false`
    //    — the plugin's default would WRITE that same global onto the host page, which is
    //    this bullet in reverse.
    //
    //    Load-bearing consequence for `beforeSend` below: it must keep `debug_meta`.
    //    `prepareEvent` fills it from the injected debug IDs BEFORE the hook runs, so
    //    deleting it — or converting that delete-list into a true allowlist without
    //    carrying the field across — silently un-symbolicates every frame while every
    //    gate stays green. See the note on the hook itself.
    //  - `sendClientReports` defaults to true, which posts a periodic outcome summary to
    //    the ingest endpoint when the page is hidden. It is SDK bookkeeping we have no use
    //    for, and it would turn one crash into a second uninvited request from their page.
    release: undefined,
    sendClientReports: false,
    // **An explicit, minimal list — required, and not for the reason it looks like.**
    //
    // It would be easy to read this as "defaults off". It isn't: `getDefaultIntegrations`
    // runs inside `Sentry.init`, and a bare `new BrowserClient(...)` never installs a
    // default integration at all. What makes the option load-bearing is that `Client.init`
    // does `this._options.integrations.some(...)`, which THROWS on `undefined` — inside a
    // fallback, where a throw blanks the widget.
    //
    // So nothing here is being suppressed; the two below are being chosen, and each is a
    // pure event processor that touches nothing on the host page:
    //
    //  - `dedupe` — the seam is now called from render bodies. `Link` reports a refused
    //    href while rendering, so ONE malformed `webPath` in a search-results list is one
    //    event per row per render pass. That was free while this was console-only.
    //  - `linkedErrors` — walks `error.cause`. Without it the chain is dropped, which is
    //    most of the diagnostic value whenever a foreign failure is rethrown as ours.
    //
    // What we still decline is everything that reaches OUT of the widget, and none of it
    // is reachable from here anyway: `GlobalHandlers` would hook the host's own error
    // events, `Breadcrumbs` would record their console output, DOM clicks and the full URL
    // of every fetch their page makes, `HttpContext` would set `request.url` from
    // `location.href` — the one string `hostPageUrl` exists to avoid.
    integrations: [dedupeIntegration(), linkedErrorsIntegration()],
    beforeSend: (event, hint) => {
      // **Scrub the carriers a HOST could have written to.** The scope we capture on is
      // not as private as `new Scope()` makes it look: `getCombinedScopeData` always
      // merges `getGlobalScope()`, and the global carrier is keyed by SDK *version
      // string*, so a host page running this same `@sentry/browser` version shares it
      // with us. Their `setTag`/`setExtra`/`setContext` would ride out on OUR events, and
      // ours on theirs — the cross-tenant contamination #95 found between two Fathom
      // trackers, one layer down.
      //
      // Dropping `extra` closes a second hole on its own: a thrown plain object is
      // serialized into it wholesale, so anything a caller threw instead of an `Error`
      // would leave the page in full.
      //
      // **This is a DELETE-LIST, and calling it an allowlist (as this comment did until
      // #130) is the kind of false claim that outlives the person who wrote it.** `tags`
      // and `request` below really are rebuilt from scratch; everything else is removed by
      // name, so any field neither we nor this list anticipated travels. A true allowlist
      // is the stronger form and remains the right eventual shape — deliberately not
      // attempted here, because #130 is a build-plumbing ticket and enumerating the fields
      // an event legitimately needs (`event_id`, `timestamp`, `platform`, `sdk`,
      // `exception`, `level`, `environment`, `debug_meta`, …) is a change to the seam that
      // deserves its own ticket and its own review rather than a drive-by.
      //
      // **What that means today: `debug_meta` survives because nothing deletes it, and
      // source-map symbolication depends on exactly that.** `prepareEvent` fills it from
      // the debug IDs the bundler injected, BEFORE this hook runs. So whoever does convert
      // this to a real allowlist must carry `debug_meta` across, or every production frame
      // silently stops resolving with every gate still green. `report.sentry.test.ts` fails
      // if it stops surviving; that spec is the guard, not this paragraph.
      event.tags = {
        'atlas.kind': event.tags?.['atlas.kind'],
        'atlas.context': event.tags?.['atlas.context'],
      }
      delete event.user
      delete event.extra
      delete event.contexts
      delete event.breadcrumbs

      // `request.url` is set, not deleted: the host page is the most useful field on the
      // event, and `hostPageUrl` is the form we are allowed to have — origin and path,
      // never the query or fragment, which on somebody else's site can carry a
      // password-reset token, an OAuth `#access_token` or an email address. One policy,
      // two paths out (see the docblock on `hostPageUrl` below).
      //
      // NOTE this genuinely costs us something here that it does not cost the human
      // report. That docblock says nothing diagnostic is lost because the in-widget route
      // travels separately as `path` — true there, false here: under HashRouter the
      // widget's route IS the fragment. `atlas.context` names the boundary, which is the
      // cheap part of what we gave up; carrying the route as its own tag is a follow-up.
      event.request = { url: hostPageUrl() }

      // Attachments are appended AFTER this hook, so nothing above can remove one. Only
      // the host could have set it (we never attach), which is exactly why it goes.
      if (hint) hint.attachments = []

      return event
    },
  })

  const scope = new Scope()

  scope.setClient(client)
  client.init()

  return (error, kind, context) => {
    // A CHILD scope per event. Tags set on the shared one persist, so the second failure
    // of a session would arrive wearing the first one's kind — and a mislabelled event is
    // worse than an unlabelled one.
    const event = scope.clone()

    event.setTag('atlas.kind', kind)
    event.setTag('atlas.context', context)
    event.captureException(error)
  }
}

/**
 * Hand a classified failure to Sentry, if there is anything to hand it to.
 *
 * Never awaited and never throws: the caller is inside an error fallback, where a rejected
 * promise nobody caught is an unhandled rejection in the host's console and a throw blanks
 * the widget on their page.
 */
function captureError(error: unknown, kind: ErrorKind, context: string): void {
  const dsn = reportingDsn()

  if (!dsn || !REPORTED_KINDS[kind] || sent >= MAX_EVENTS_PER_PAGE) return

  sent += 1

  // The FAILURE is remembered too, not just the success. A host whose CSP omits the ingest
  // origin — or whose network drops the chunk — fails this import every time, and
  // re-attempting per error would turn one broken screen into a stream of blocked requests
  // and exactly the console noise this seam exists to avoid. One attempt, one answer, for
  // the life of the page.
  reporterLoad ??= loadReporter(dsn).catch(() => null)

  reporterLoad.then((send) => send?.(error, kind, context)).catch(() => {})
}

/**
 * Record a failure the widget has already absorbed (issues #89, #108).
 *
 * It began as "a failure while rendering an error state", and that is no longer what it
 * is: since #108 every ErrorBoundary reports through here (via `ResetErrorBoundary`),
 * alongside the handful of imperative callers that swallow something and carry on — a
 * refused `Link` href, a fragment the host wouldn't let us claim, a recovery ladder that
 * couldn't resolve a rung.
 *
 * What unites them is the part that matters: each one has ALREADY degraded gracefully, so
 * nothing here may throw — but a swallowed failure no one ever sees is how a broken
 * recovery path survives for months. This is the seam that keeps both.
 *
 * **This is the single call site the error reporter is wired into** (issue #108), which is
 * what the promise made here originally bought: Sentry arrived by changing this function
 * and nothing else, and `@sentry/browser` is imported from exactly one place in the repo.
 * Callers still just say what went wrong and where; the seam decides the failure's kind
 * (`classifyError`), whether that kind is worth an event (`REPORTED_KINDS`), and what may
 * travel with it.
 *
 * The console line is unconditional and comes first — it is the only signal on a build
 * with no DSN, on a host that has declined reporting, and on a developer's machine. **Its
 * LEVEL follows the same table that decides what is worth an event**, because the console
 * it writes to belongs to the host: now that every boundary reports, a dead link would
 * otherwise put a red error in a stranger's log for something we have already said is not
 * a malfunction. Saying "not news" to Sentry and "error" to them would be the same
 * judgement pointing two ways.
 *
 * Both halves are guarded, in both directions: a host page is free to replace
 * `console.error` with something that throws, and that must not cost us the report; a
 * reporting failure must not cost us the line in their log. Neither may reach the caller,
 * because every caller has already absorbed the failure.
 */
export function reportInternalError(error: unknown, context: string): void {
  // Classified once and shared: `classifyError` never throws (it guards its own body), and
  // computing it twice invites the log and the event to disagree about what happened.
  const kind = classifyError(error)

  try {
    // Spelled as two calls rather than one computed member, because `no-console` allows
    // `warn`/`error` by NAME — a `console[level]` form reads as a banned `console.log` to
    // the rule and fails the lint gate.
    const line = `[${LOG_PREFIX}] ${context}`

    if (REPORTED_KINDS[kind]) console.error(line, error)
    else console.warn(line, error)
  } catch {
    // Nothing left to do — a logger that throws is not worth a second attempt.
  }

  try {
    captureError(error, kind, context)
  } catch {
    // Nothing left to do — see above. `captureError` is written not to throw; this is the
    // guarantee rather than the expectation.
  }
}

/**
 * Record a HOST-SIDE integration mistake — the embed script included twice, a second
 * `<sahaj-atlas>` element on one page (issue #92).
 *
 * The same seam as `reportInternalError` at a lower severity. `warn` rather than `error`
 * because nothing is broken — the widget declined to do something twice.
 *
 * **It stays console-only, and that is a decision rather than an omission** (issue #108).
 * These are the most tempting thing in the file to send — each one produces a widget that
 * renders nothing on a real customer's page while every gate in this repo stays green —
 * and they are sent anyway by nobody, for two reasons that survive wanting the data:
 *
 *  - **They fire before the host has been asked.** The duplicate-script warning runs at
 *    module load, from the `customElements.define` guard, and the duplicate-element one
 *    from `connectedCallback` — both potentially before `<sahaj-atlas>`'s attributes have
 *    been read. A beacon here could therefore leave a page whose
 *    owner had set `error-reporting="false"`, which is the one thing #95's posture says we
 *    do not do. An opt-out you can outrun is not an opt-out.
 *  - **It is a misconfiguration, not a crash, and it recurs per pageview.** A doubled
 *    embed on a busy page would post one event on every single load, indefinitely, with no
 *    host-side way to stop it — and the reader who can actually fix it is whoever installed
 *    the embed, who has the console line right there.
 *
 * If the blind spot proves real, the fix is to queue these and flush once the privacy
 * attributes have been read — not to drop the gate.
 *
 * Guarded identically: a host is free to have replaced `console.warn` with something that
 * throws, and the mount path must not die telling somebody about itself.
 */
export function reportIntegrationWarning(message: string): void {
  try {
    console.warn(`[${LOG_PREFIX}] ${message}`)
  } catch {
    // Nothing left to do — a logger that throws is not worth a second attempt.
  }
}

/**
 * The context auto-attached to every issue report — everything the viewer shouldn't
 * have to type. Assembled from the widget's own route plus the host page's globals, so
 * a report arrives with enough to reproduce it (issue #79).
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
 * The host page, as origin + path only.
 *
 * Deliberately NOT `location.href`: we're embedded on sites we don't control, and a
 * host's own query or fragment can carry a password-reset token, an OAuth
 * `#access_token`, or an email address. A report is emailed onward to admins (#80), so
 * anything captured here lands in mailboxes and logs under a far weaker posture than the
 * page it came from. Nothing diagnostic is lost — the in-widget route travels separately
 * as `path`.
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

// Read behind a guard: the unit lane runs in node and a host may server-render the
// widget, so this global is not a given.
const browserAgent = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent)

/**
 * Cap for the thrown message. It's server-controlled text — a zod parse failure
 * serializes every issue and runs to multiple KB — and it rides along in the payload.
 */
const MAX_ERROR_LENGTH = 500

/**
 * Pure given its inputs — the browser-derived fields default from the live globals but
 * can be passed in, so this is testable and never throws outside a browser. Blank
 * optional fields are omitted rather than carried as `null`/`''`, keeping the payload a
 * readable summary of what's actually known.
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
 * (sydevs/SahajCloud#602, wired in #103). `api.contactAdmin` maps it onto that
 * endpoint's own body — notably `pageUrl` → `hostUrl` — and clamps each context value to
 * the bound the endpoint enforces.
 */
export type ReportPayload = Report & {
  turnstileToken: string
  context: ReportContext
}
