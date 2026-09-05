/**
 * Returns `url` only if it is an http(s) absolute URL, else `undefined`. This
 * guards a server-provided `webUrl` before it reaches a `<link rel="canonical">`
 * or `og:url` href: the same http(s)-only safety `SafeUrlSchema` enforces for
 * event URLs, for the plain-string region/client `webUrl`s that are not
 * zod-guarded.
 */
export const validateWebUrl = (url: string | null | undefined): string | undefined =>
  url && /^https?:/i.test(url) ? url : undefined

/**
 * The URL an event's share / calendar-export surfaces should hand out, or `undefined` when there
 * honestly is not one (issues #115, #154).
 *
 * Two rules, in this order:
 *
 * 1. **The canonical wins in every mode.** `event.webUrl` is the event's own public page on the
 *    owning site: it is indexable, it unfurls with a title/description/image in a share sheet, and
 *    it outlives the widget session that produced it. A widget URL is none of those things even
 *    when it works, so this is a preference, not a fallback.
 * 2. **Otherwise the event's own widget URL, if the widget's route is in a URL at all.** With no
 *    canonical (an unpublished or publication-gated event has a null `webUrl`) this is the next
 *    best thing, and since #154 it is a genuinely good one: query routing puts the route in the
 *    host's own address bar, so `hrefFor(event.path)` is a real, linkable URL on their domain.
 *
 * **`hrefFor(route)` rather than the address bar, and that is a fix rather than a refactor.**
 * Handing over `window.location.href` handed over *the drawer the sharer was standing in* — a
 * share of `/507/share`, or a half-filled registration form — which report 115 recorded and could
 * not fix while the widget's URL was a fragment. Resolving the EVENT's route removes that whole
 * class of wrongness, and it also means the answer no longer depends on when in a session it is
 * read.
 *
 * `undefined` is the point: a caller must then show no link rather than a wrong one. The canonical
 * still goes through `validateWebUrl`, so a CMS value that slipped a non-http scheme cannot reach
 * a third-party share intent.
 *
 * **Known residue, deliberately left:** the host page's own query string rides along in the
 * resolved URL, because `hrefFor` preserves it — and that string reaches the clipboard,
 * `navigator.share` and every `react-share` intent. `hostPageUrl` (`lib/report.ts`) reduces the
 * same URL to `origin + pathname` before telemetry, for the reason stated there. Sharing does NOT
 * follow suit, because the host's query is sometimes what makes the page resolve at all:
 * WordPress's default permalinks are `/?p=123`, and this whole feature exists for WordPress hosts.
 * The trade — leak a host param, or break the link on a query-routed host — is a product call.
 */
export const shareableUrl = (
  canonical: string | null | undefined,
  routeUrl: string | null | undefined,
): string | undefined => validateWebUrl(canonical) ?? validateWebUrl(routeUrl)
