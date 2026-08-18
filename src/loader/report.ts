/**
 * Telling SahajCloud what this embed looks like from the inside (#149, #153).
 *
 * The payload builder is pure and lives here so the node lane can assert the one property that
 * matters most, below. The send itself belongs to the widget rather than the loader
 * (`Widget.tsx`): it needs the API key and the shared SDK client, and it must not happen until
 * the widget has genuinely mounted — a report filed from script load attests to nothing.
 */
import type { EmbedFingerprint } from './detect'

/** A mount, split the way `POST /api/clients/report` takes it. */
export type MountParts = {
  /** Bare `scheme://host[:port]` — no trailing slash, no path. */
  origin: string
  /** Rooted path, carrying at most a WordPress `?p=<digits>`. Never a fragment. */
  pathname: string
}

export type EmbedReport = EmbedFingerprint & MountParts

/**
 * The one query string a reported path may carry: a WordPress default permalink.
 *
 * Kept character-for-character in step with SahajCloud's `WORDPRESS_PERMALINK_RE`, because the
 * endpoint **rejects** a path it does not recognise rather than stripping it — a widget leaking a
 * seeker's `?utm_source=…` has to fail loudly, so a spelling that disagrees with the server's is a
 * 400 on every report rather than a quiet difference.
 */
const WORDPRESS_PERMALINK_RE = /^\?p=\d+$/

/**
 * Reduce the page's URL to the mount, discarding everything we have no business sending.
 *
 * **The host's query string and fragment never leave the page.** This is the third time this repo
 * has ruled that way and the reasoning has not changed: a host's query can carry a password-reset
 * token, an email address or an OAuth code, and their fragment can carry an `#access_token`.
 * `hostPageUrl()` (`src/lib/report.ts`) strips exactly this before anything reaches Sentry, and
 * Fathom is loaded `auto: false` on the same grounds. A reporting endpoint we added for our own
 * convenience is not the place to start making an exception.
 *
 * **`?p=<digits>` is the one exception, and it is not a softening of that rule** (#153). On a
 * WordPress site using default permalinks every page is `/?p=<id>`, so discarding the query
 * collapses every post onto `https://site.com/` — every mount lands in one record and the page an
 * operator needs to name as canonical cannot be named at all. Those sites are precisely this
 * feature's audience. A post id is not seeker input, which is what separates it from every other
 * query string, `?p=123&utm_source=…` included: a permalink with anything appended is refused
 * whole rather than trimmed back to its first parameter.
 *
 * Returns `undefined` for a URL that will not parse, which the caller treats as "nothing to
 * report" — a report is a diagnostic, and no diagnostic is worth a throw in someone else's page.
 *
 * ⚠ **Not the same function as `hostPageUrl()` (`src/lib/report.ts`), and they must not be merged**
 * even though both reduce a URL to origin + path in a `try`. That one builds the context on an
 * issue report a human reads and forwards; giving it this carve-out would put a host's `?p=` into
 * an email, and giving this one its stricter rule would re-break every WordPress mount.
 */
export function mountParts(href: string | null | undefined): MountParts | undefined {
  try {
    const url = new URL(String(href))

    // Not `url.href` minus the extras: reading the fields is what makes it obvious at a glance
    // that nothing else can survive, and it cannot be defeated by a URL shape we did not
    // anticipate. An opaque origin serialises to "null", which is not a mount worth recording.
    if (url.origin === 'null' || !url.origin) return undefined

    const permalink = WORDPRESS_PERMALINK_RE.test(url.search) ? url.search : ''

    return { origin: url.origin, pathname: `${url.pathname}${permalink}` }
  } catch {
    return undefined
  }
}

/** The report body, or `undefined` when the page has no reportable mount. */
export function buildReport(
  fingerprint: EmbedFingerprint,
  href: string | null | undefined,
): EmbedReport | undefined {
  const parts = mountParts(href)

  return parts ? { ...fingerprint, ...parts } : undefined
}
