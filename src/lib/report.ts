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

  if (typeof error === 'object' && 'message' in error) {
    const { message } = error as { message: unknown }

    return typeof message === 'string' && message ? message : undefined
  }

  return String(error) || undefined
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

// Read behind a guard: the unit lane runs in node and a host may server-render the
// widget, so neither global is a given.
const hostPageUrl = () => (typeof window === 'undefined' ? '' : window.location.href)
const browserAgent = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent)

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
    ...(error ? { error } : {}),
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
