/**
 * Returns `url` only if it is an http(s) absolute URL, else `undefined`. Guards a
 * server-provided `webUrl` before it reaches a `<link rel="canonical">` / `og:url`
 * href — the same http(s)-only safety `SafeUrlSchema` enforces for event URLs,
 * for the plain-string region/client `webUrl`s that aren't zod-guarded.
 */
export const validateWebUrl = (url: string | null | undefined): string | undefined =>
  url && /^https?:/i.test(url) ? url : undefined

/**
 * The URL an event's share / calendar-export surfaces should hand out — or `undefined`
 * when there honestly isn't one (issue #115).
 *
 * Two rules, in this order:
 *
 * 1. **The canonical wins in every mode.** `event.webUrl` is the event's own public page
 *    on the main site: it is indexable, it unfurls with a title/description/image in a
 *    share sheet, and it outlives the widget session that produced it. A widget URL is
 *    none of those things even when it works, so this is a preference, not a fallback —
 *    standalone and embedded alike.
 * 2. **The current address only if it identifies the route.** With no canonical (an
 *    unpublished or publication-gated event has a null `webUrl`) the address bar is the
 *    next best thing — but only where the widget's route is actually IN it. Under the
 *    standalone BrowserRouter it's the pathname; embedded, it's the `#!` fragment. On a
 *    host page whose anchor the widget declined to take (`#respond`), the widget routes in
 *    memory and writes nothing, so `location.href` names the host's comment form and
 *    nothing about the meditation. `linkable` (`config/mode.ts`) is that answer, decided
 *    once by `mountRoute`; this never re-derives it from `window`.
 *
 * Returning `undefined` is the point: a caller must then show no link rather than a
 * wrong one. Both candidates go through `validateWebUrl`, so a `file://` document or a
 * CMS value that slipped a non-http scheme can't reach a third-party share intent.
 *
 * **Known residue, deliberately left:** `currentHref` is passed through whole, host query
 * string included, and that string reaches the clipboard, `navigator.share` and every
 * `react-share` intent. `hostPageUrl` (`lib/report.ts`) reduces the same URL to
 * `origin + pathname` before telemetry, for the reason stated there — a host's query can
 * carry a reset token or an email address — and Fathom is loaded `auto: false` on the same
 * grounds. Sharing does NOT follow suit, because the host page's query is sometimes what
 * makes the page resolve at all: WordPress's default permalinks are `/?p=123`, and this
 * whole feature exists for WordPress hosts. Stripping it would hand out a link to their
 * home page carrying our fragment. The trade — leak a host param, or break the link on a
 * query-routed host — is a product call rather than a refactor, and it predates the
 * `linkable` axis (which narrowed the exposure from three modes to two). Pinned by the
 * `EMBEDDED_HASH` fixture in `url.test.ts`, which carries a query for exactly that reason.
 */
export const shareableUrl = (
  canonical: string | null | undefined,
  currentHref: string | null | undefined,
  linkable: boolean,
): string | undefined =>
  validateWebUrl(canonical) ?? (linkable ? validateWebUrl(currentHref) : undefined)
