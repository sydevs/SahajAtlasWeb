/**
 * Which page this embed is mounted on, reduced to what may leave it (#149, #153).
 *
 * **This is the only module that reads the host's URL**, and it answers one question: what is the
 * mount, in the two fields `POST /api/clients/report` stores it under. Everything else the widget
 * reports — how it is framed, whether it can write the URL, whether a parameter survives — is a
 * probe rather than a URL, and lives in `loader/detect.ts`.
 *
 * **It sits in `lib/` rather than `loader/`, and the move is the point.** It used to live beside
 * the loader's probes and compose an `EmbedReport` there, on idle, which meant the URL was captured
 * some time before the widget mounted and then carried on the boot singleton as a second copy of an
 * observation the singleton already held. Only the send site needs a mount, the send site runs in
 * the widget, and it can read the URL for itself at the moment it reports — so the loader is out of
 * this entirely and the duplicate is gone. The one type that joins a mount to an observation is now
 * the request body (`config/api/mutate.ts`), where a wire shape belongs.
 *
 * Pure and DOM-free, so the node lane can assert the property that matters most, below.
 */

/** A mount, split the way `POST /api/clients/report` takes it. */
export type MountParts = {
  /** Bare `scheme://host[:port]` — no trailing slash, no path. */
  origin: string
  /** Rooted path, carrying at most a WordPress `?p=<digits>`. Never a fragment. */
  pathname: string
}

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
 * The rest of what the endpoint will accept, kept in step with `embedReportSchema` for the same
 * reason as the regex above: a payload the server refuses is a **400 on every single load** of that
 * page, with the widget rendering perfectly and a console warning blaming the host's configuration.
 *
 * `isBareOrigin` requires `http:`/`https:`, and `pathname` must start with `/`. Both matter for one
 * real document type: a `blob:` URL. `new URL('blob:https://site.com/uuid')` reports an origin of
 * `https://site.com` and a **pathname of `https://site.com/uuid`** — no leading slash — so a widget
 * in a blob document would otherwise report a shape that cannot be stored. The lengths are the
 * schema's `.max()`. In every case the answer is `undefined`, which the caller already treats as
 * "nothing to report": not reporting a page is a gap in a record, while reporting it wrongly is a
 * request per page view that can never succeed.
 */
const REPORTABLE_PROTOCOL = /^https?:$/
const MAX_ORIGIN = 255
const MAX_PATHNAME = 512

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
    if (!REPORTABLE_PROTOCOL.test(url.protocol)) return undefined

    const permalink = WORDPRESS_PERMALINK_RE.test(url.search) ? url.search : ''
    const pathname = `${url.pathname}${permalink}`

    if (!pathname.startsWith('/')) return undefined
    if (url.origin.length > MAX_ORIGIN || pathname.length > MAX_PATHNAME) return undefined

    return { origin: url.origin, pathname }
  } catch {
    return undefined
  }
}

/**
 * The mount of the page the widget is on right now.
 *
 * A one-line convenience over {@link mountParts}, and the reason it exists is *when* rather than
 * what: the caller is the send site, so the URL is read at the moment the report is filed rather
 * than captured earlier and carried. A host router that rewrote the URL between the loader's probes
 * and the widget's mount is therefore reported as it finally stands.
 */
export function currentMount(prefix?: string): MountParts | undefined {
  const parts = mountParts(window.location.href)

  // In `path` routing the widget's route is part of the pathname, so the raw location names a
  // route rather than a mount. `prefix` is the subtree root the widget is mounted at, which is the
  // thing worth filing — see the argument on `announceEmbed`'s own `prefix`.
  return parts && prefix !== undefined ? { ...parts, pathname: prefix || '/' } : parts
}
