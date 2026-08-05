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
  contract: true,
  unknown: true,
}

const isErrorKind = (value: unknown): value is ErrorKind =>
  typeof value === 'string' && value in ERROR_KINDS

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
    // One read covers all three duck-typed shapes: our tag, a PayloadSDKError's status,
    // and a ZodError's name/issues. `instanceof` is avoided throughout — it fails across
    // realms (an iframe, a worker), and the widget runs inside host pages we don't own.
    const { kind, status, name, issues } =
      typeof error === 'object' && error !== null
        ? (error as { kind?: unknown; status?: unknown; name?: unknown; issues?: unknown })
        : {}

    if (isErrorKind(kind)) return kind

    if (typeof status === 'number') {
      if (status === 401 || status === 403) return 'config'
      if (status === 404) return 'not-found'
      if (status >= 500) return 'server'
    }

    // A zod parse failure — SahajCloud's shape drifted from ours.
    if (name === 'ZodError' || Array.isArray(issues)) return 'contract'

    const message = errorMessage(error)

    if (name === 'TypeError' && message && NETWORK_MESSAGE.test(message)) return 'offline'

    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'

    return 'unknown'
  } catch {
    return 'unknown'
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
 * What #80 will POST to SahajCloud's shared `/api/contact-admin` (sydevs/SahajCloud#602).
 * Today it's simply what the submit handler alerts, so the follow-up only has to swap
 * in the mutation.
 */
export type ReportPayload = Report & {
  turnstileToken: string
  context: ReportContext
}
