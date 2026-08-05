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
export type ErrorKind = 'offline' | 'server' | 'not-found' | 'config' | 'contract' | 'unknown'

/** The copy + actions one kind is allowed to render. */
export type ErrorPolicy = {
  /** `common` namespace key for the sentence shown in place of the thrown string. */
  messageKey: string
  /** Reset the boundary and re-run the failed query. */
  retry: boolean
  /** Escape into live inventory via `/search` (issue #52). */
  nearby: boolean
  /** Open the report modal, carrying the thrown message as context (issue #79). */
  report: boolean
}

/**
 * The action table. Kept as data so neither fallback hard-codes a button list — they
 * render the same policy in their own chrome.
 *
 * `report` is always the lowest-weight CTA in both fallbacks, so "secondary" needs no
 * axis of its own: on `server` it sits under a retry that's likelier to help, and on
 * `config`/`contract` it's the only thing offered and so the only thing to look at.
 */
export const ERROR_POLICY: Record<ErrorKind, ErrorPolicy> = {
  // Connectivity is not something the team can act on, and the report POST (#80) needs
  // the very network that just failed — so no report CTA, and no nearby search (which
  // would fail identically).
  offline: { messageKey: 'error.offline', retry: true, nearby: false, report: false },
  server: { messageKey: 'error.server', retry: true, nearby: false, report: true },
  // A dead link isn't a wrong turn to retry — it's a way back into live inventory.
  'not-found': { messageKey: 'error.not_found', retry: false, nearby: true, report: false },
  // The embed is misconfigured, or SahajCloud's shape drifted. Both need a human;
  // neither is fixed by pressing anything.
  config: { messageKey: 'error.config', retry: false, nearby: false, report: true },
  contract: { messageKey: 'error.generic', retry: false, nearby: false, report: true },
  unknown: { messageKey: 'error.generic', retry: true, nearby: false, report: true },
}

/** A thrown value's HTTP status, when it carries one (`PayloadSDKError`). Duck-typed
 *  rather than `instanceof`, so the shape is the dependency — as `mutate.ts` does. */
const statusOf = (error: object): number | undefined => {
  const { status } = error as { status?: unknown }

  return typeof status === 'number' ? status : undefined
}

// Native `fetch` rejects with a TypeError whose wording differs per engine ("Failed to
// fetch" / "NetworkError when attempting to fetch resource." / "Load failed"). Matched
// on the wording as well as the type, because a TypeError is just as often OUR bug —
// and a programming error deserves the report CTA that `offline` suppresses.
const NETWORK_MESSAGE = /failed to fetch|networkerror|network request failed|load failed/i

// `instanceof TypeError` fails across realms (an iframe, a worker), and the widget runs
// inside host pages we don't control — so read the tag the engine sets instead.
const isTypeError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'TypeError'

/** The developer strings thrown by our own code, in the order they're checked. */
const SENTINELS: [RegExp, ErrorKind][] = [
  [/^Region not found:|^Not an event:/, 'not-found'],
  [/^Not authenticated as an Atlas client|^Missing api key\./, 'config'],
  [/^SahajCloud request returned no data:/, 'server'],
]

/**
 * Narrow an unknown thrown value to the kind of failure it represents.
 *
 * Runs INSIDE an error fallback, so — like `errorMessage` above — the one thing it must
 * never do is throw: a hostile value (a throwing getter, a null-prototype object) is
 * `unknown`, not an unrecoverable blank widget on someone else's page.
 *
 * Order matters. An HTTP status is checked first because it proves a server answered,
 * which outranks anything `navigator.onLine` claims; `navigator.onLine` is checked last,
 * as the weakest signal — it only reports whether the machine has a link, not whether
 * this request could have travelled it.
 */
export function classifyError(error: unknown): ErrorKind {
  try {
    if (typeof error === 'object' && error !== null) {
      const status = statusOf(error)

      if (status !== undefined) {
        if (status === 401 || status === 403) return 'config'
        if (status === 404) return 'not-found'
        if (status >= 500) return 'server'
      }

      // A zod parse failure — SahajCloud's shape drifted from ours. Duck-typed for the
      // same reason as the status, and because a ZodError can cross a module boundary.
      const { name, issues } = error as { name?: unknown; issues?: unknown }

      if (name === 'ZodError' || Array.isArray(issues)) return 'contract'
    }

    const message = errorMessage(error)

    if (message) {
      for (const [pattern, kind] of SENTINELS) {
        if (pattern.test(message)) return kind
      }

      if (isTypeError(error) && NETWORK_MESSAGE.test(message)) return 'offline'
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'

    return 'unknown'
  } catch {
    return 'unknown'
  }
}

/** The classification and its policy in one read — what both fallbacks actually want. */
export const errorPolicy = (error: unknown): ErrorPolicy & { kind: ErrorKind } => {
  const kind = classifyError(error)

  return { kind, ...ERROR_POLICY[kind] }
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
 * What #80 will POST to SahajCloud's shared `/api/contact-admin` (sydevs/SahajCloud#602).
 * Today it's simply what the submit handler alerts, so the follow-up only has to swap
 * in the mutation.
 */
export type ReportPayload = Report & {
  turnstileToken: string
  context: ReportContext
}
