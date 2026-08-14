/**
 * Telling SahajCloud what this embed looks like from the inside (#149).
 *
 * The payload builder is pure and lives here so the node lane can assert the one property that
 * matters most, below. The POST itself is gated: the receiving endpoint is a separate SahajCloud
 * ticket, and the loader must work — render, detect, diagnose — whether or not it exists yet.
 */
import type { EmbedFingerprint } from './detect'

export type EmbedReport = EmbedFingerprint & {
  /** `origin + pathname`. Never the query string, never the fragment. */
  mount: string
}

/**
 * Reduce the page's URL to the mount key, discarding everything we have no business sending.
 *
 * **The host's query string and fragment never leave the page.** This is the third time this repo
 * has ruled that way and the reasoning has not changed: a host's query can carry a password-reset
 * token, an email address or an OAuth code, and their fragment can carry an `#access_token`.
 * `hostPageUrl()` (`src/lib/report.ts`) strips exactly this before anything reaches Sentry, and
 * Fathom is loaded `auto: false` on the same grounds. A reporting endpoint we added for our own
 * convenience is not the place to start making an exception.
 *
 * `origin + pathname` is also precisely the key the metadata is stored under, so a site with
 * several embeds accumulates one record per mount instead of overwriting a single blob.
 *
 * Returns `undefined` for a URL that will not parse, which the caller treats as "nothing to
 * report" — a report is a diagnostic, and no diagnostic is worth a throw in someone else's page.
 */
export function mountKey(href: string | null | undefined): string | undefined {
  try {
    const url = new URL(String(href))

    // Not `url.href` minus the extras: reading the two fields is what makes it obvious at a
    // glance that nothing else can survive, and it cannot be defeated by a URL shape we did not
    // anticipate. An opaque origin serialises to "null", which is not a mount worth recording.
    if (url.origin === 'null' || !url.origin) return undefined

    return `${url.origin}${url.pathname}`
  } catch {
    return undefined
  }
}

/** The report body, or `undefined` when the page has no reportable mount. */
export function buildReport(
  fingerprint: EmbedFingerprint,
  href: string | null | undefined,
): EmbedReport | undefined {
  const mount = mountKey(href)

  return mount ? { ...fingerprint, mount } : undefined
}
