/**
 * Where the widget's route lives in the host page's URL (#154).
 *
 * The widget used to route off the URL fragment (`#!/gb/london`). It now routes off a **query
 * parameter** on the host's own URL:
 *
 * ```
 * https://sahajayoga.nl/classes?atlas=/nl/amsterdam/1204
 * ```
 *
 * **Why, in one sentence: a fragment is never an indexable URL and a query string is.** No search
 * engine has ever treated `#x` as a distinct page — the `#!` AJAX-crawling scheme was deprecated in
 * 2015 and dropped in 2018 — so under hash routing every event on every embed was the same URL to a
 * crawler. A query parameter needs no wildcard rewrite either, which is what makes it work
 * identically on WordPress, Wix, Weebly and Joomla; it was measured surviving `replaceState`, two
 * animation frames, 2.5s of runtime boot and a cold deep-link load on two live Wix sites.
 *
 * It also deletes a whole class of bug rather than adding a mode. The widget no longer has any
 * opinion about the host's `#anchor`: the three-way ours/free/foreign decision, the blank-widget
 * failure of #92, and the two spellings react-router normalised between are all simply gone.
 *
 * This module is pure — no `window` — so the whole decision is testable in the node lane.
 * `atlas-history.ts` is the part that touches `history`.
 */
import { safePath } from './path'

/**
 * The query parameter the route rides on.
 *
 * **Duplicated from `ROUTE_PARAM` in `src/loader/config.ts`, deliberately.** The loader is a
 * separate build entry whose whole point is to stay ~3 KiB, so it must not import from the widget
 * and the widget must not pull it into a shared chunk. `src/loader/literals.test.ts` pins the two
 * copies together, the same arrangement `src/lib/element.ts` uses for the element name.
 *
 * `atlas` is not a WordPress reserved query var. Note `embed` **is**, and `map` is disqualified
 * twice over — too generic, and the widget already means something else by it.
 */
export const ROUTE_PARAM = 'atlas'

/** How the widget's route reaches the URL. */
export type RouterMode = 'query' | 'path' | 'memory'

export type MountDecision = {
  mode: RouterMode
  /** The route to boot at. */
  path: string
  /**
   * The URL shape actually in effect — what an observer of this page would *find*, as opposed to
   * the `routing` parameter, which is what somebody asked for (#153).
   *
   * The two differ whenever `path` was asked for and could not be honoured — no prefix on the
   * client record, or a page served outside it — in which case this reads `query` and `warning`
   * says why. The readiness marker attests this value, and a marker carrying a request rather than
   * a finding is worth nothing to the verifier reading it. Memory is a degradation of the query
   * shape rather than a third shape — the route is not in the URL at all, which the marker says
   * through `urlWritable` instead.
   */
  routing: 'query' | 'path'
  /** The resolved path prefix, when `mode === 'path'`. The router composes hrefs from it. */
  prefix?: string
  /**
   * Did `path` come from the PAGE's `?atlas=`, rather than the embed's configured default?
   *
   * Two very different facts that `path` alone cannot distinguish once resolved. A page route is
   * a visitor who deep-linked or followed a shared link; a script route is the host saying
   * "start here when nobody asked". Only the first earns the compact card opening itself on
   * mount — otherwise every host who configures a default view would get a full-screen overlay
   * over their content on every page load.
   */
  fromPage: boolean
  /** Set when the requested mode could not be honoured, for the caller to report. */
  warning?: string
}

/**
 * Encode a widget route as a parameter value.
 *
 * `/` and `,` are restored after encoding because both are explicitly legal in a query value
 * (RFC 3986: `query = *( pchar / "/" / "?" )`) and both appear constantly — every route is
 * slash-separated and `?center=4.9,52.3` is a comma pair. Leaving them encoded would turn the one
 * thing that has to be readable in a shared link, `?atlas=%2Fnl%2Famsterdam%2F1204`, into noise.
 *
 * `?` is deliberately **left** encoded. It is legal too, but a raw `?` inside the value makes it
 * ambiguous at a glance whether a nested query belongs to the widget or to the host, and the two
 * saved characters are not worth that.
 */
export const routeToParam = (route: string): string =>
  encodeURIComponent(route).replace(/%2F/g, '/').replace(/%2C/g, ',')

/**
 * Read a widget route out of a host page's query string.
 *
 * Guarded by `safePath`, so `?atlas=//evil.example`, `?atlas=javascript:…` and the TAB/LF/CR
 * variants yield `undefined` rather than a route — the same guard `webPath` gets, and the more
 * necessary of the two, because this value arrives on a link somebody clicked.
 *
 * Never throws: a malformed query string is a page we do not own, and a route is not worth taking
 * the host's scripts down for.
 */
export function routeFromParam(search: string | null | undefined): string | undefined {
  try {
    return safePath(new URLSearchParams(search ?? '').get(ROUTE_PARAM))
  } catch {
    return undefined
  }
}

/**
 * Decide which router to mount and where to start.
 *
 * **`path` is accepted and not yet honoured.** Its prefix comes from the client record rather than
 * the script URL, and that record arrives after the router must already exist — so it lands with
 * the canonical-ownership work. Until then it falls back to query and says so, because a routing
 * mode that silently behaves as a different one is how a host concludes their server config is
 * working when nothing is using it.
 *
 * **Memory is a degradation, never a request.** It is taken when the URL cannot be written at all
 * — a sandboxed iframe or a `file://` document, which the loader has already probed — because a
 * route we cannot write is a route nobody can link to, and mounting a query router over a URL that
 * refuses writes would fail on the visitor's first click rather than at boot.
 */
export function mountDecision(input: {
  /** The requested mode, from the embed's `routing` parameter. */
  routing: 'query' | 'path'
  /** `window.location.search` of the host page. */
  search: string | null | undefined
  /** `window.location.pathname` of the host page. Only read in path mode. */
  pathname?: string
  /**
   * The path prefix for `path` routing, from the client record's `canonical.embed`.
   *
   * `undefined` means the record has not arrived, or supplies nothing usable. Path mode cannot be
   * honoured without it — see the fallback below.
   */
  prefix?: string
  /** The embed's default route, already resolved by the loader (page wins over script). */
  route?: string
  /** Whether the URL can be written at all. `undefined` means nobody probed — assume it can. */
  urlWritable?: boolean
}): MountDecision {
  const { routing, search, pathname, prefix, route, urlWritable } = input

  // A route already in the page's URL always wins: that visitor deep-linked or followed a shared
  // link, and the embed's default is only ever an answer to "nobody asked for anything".
  //
  // Read the page route into its own binding rather than inlining it: whether there WAS one is a
  // fact the tree needs (`fromPage`), and it is unrecoverable from `path` afterwards. Note this
  // cannot be derived by comparing against `route` — the loader's `resolveRoute` has already
  // folded the page route into it.
  const pageRoute = routeFromParam(search)

  // ⚠ Memory beats everything, including path. A route we cannot write is a route nobody can link
  // to, so mounting any URL-backed router over it would fail on the visitor's first click rather
  // than at boot.
  if (urlWritable === false) {
    return {
      mode: 'memory',
      path: pageRoute ?? route ?? '/',
      routing: 'query',
      fromPage: pageRoute !== undefined,
    }
  }

  if (routing === 'path') {
    // The record has not arrived, or carries no usable mount. Both are the same answer — fall back
    // to query and SAY SO — because a routing mode that silently behaves as a different one is how
    // a host concludes their server config is working when nothing is using it.
    if (prefix === undefined) {
      return {
        mode: 'query',
        path: pageRoute ?? route ?? '/',
        routing: 'query',
        fromPage: pageRoute !== undefined,
        warning:
          'routing=path needs a canonical embed on your client record to know which path prefix ' +
          'the widget is mounted under. The widget is using query routing instead.',
      }
    }

    const fromPath = routeFromPathname(pathname ?? '/', prefix, search)

    // ⚠ The basename miss (#92), caught rather than handed to react-router — whose `Router`
    // renders `null` on one, silently, which is a blank widget on somebody's page.
    if (fromPath === undefined) {
      return {
        mode: 'query',
        path: pageRoute ?? route ?? '/',
        routing: 'query',
        fromPage: pageRoute !== undefined,
        warning:
          `routing=path expected this page to be served under "${prefix}", and it is not. ` +
          'The widget is using query routing instead — check that the canonical embed on your ' +
          'client record names the page the widget is actually mounted on.',
      }
    }

    // In path mode the pathname IS the route, so it always came from the page. There is no
    // "nobody asked" state to fall back to a configured default from: the host's server chose to
    // serve us this URL.
    return { mode: 'path', path: fromPath, routing: 'path', fromPage: fromPath !== '/', prefix }
  }

  return {
    mode: 'query',
    path: pageRoute ?? route ?? '/',
    routing: 'query',
    fromPage: pageRoute !== undefined,
  }
}

/**
 * The path prefix a `path`-routed widget lives under, from the client record's `canonical.embed`.
 *
 * `canonical.embed` is a **mount key** — an origin joined to a pathname, as `splitMountKey` records
 * it on the SahajCloud side (`wemeditate.com/map`). Only the path half is ours; the origin half is
 * whatever host reported that embed, which is not necessarily the host we are running on right now
 * (a client may have several embeds and nominate one). So this reads the path and ignores the rest
 * rather than trying to match origins — being on the wrong host is a canonical-ownership question,
 * answered in the CMS, not a routing one.
 *
 * Returns `''` for a root mount, and `undefined` when there is nothing usable — which the caller
 * must treat as "cannot honour path routing" rather than as "mount at the root". Those are
 * different: a widget that silently roots itself at `/` on a host serving it under `/map` would
 * read every visitor's URL as a route it does not recognise.
 */
export function mountPrefix(embed: string | null | undefined): string | undefined {
  if (typeof embed !== 'string' || embed.trim() === '') return undefined

  // Tolerate a scheme even though the stored form has none — an operator pasting a full URL into
  // the picker is the obvious mistake, and refusing it would be a silent fallback to query.
  const withoutScheme = embed.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  const slash = withoutScheme.indexOf('/')

  if (slash === -1) return ''

  // Everything from the first slash is the mount path. Strip a trailing slash so the prefix
  // composes as `${prefix}${route}` with the route's own leading slash and never doubles it.
  const path = withoutScheme.slice(slash).replace(/\/+$/, '')

  // The same guard every other server-provided path goes through. A mount is a route prefix that
  // ends up in an `<a href>`, so `//evil.com` and the tab/LF/CR forms are refused here too.
  if (path === '') return ''

  return safePath(path) === undefined ? undefined : path
}

/**
 * The widget's route, read out of the host page's pathname under `prefix`.
 *
 * ⚠ **A miss returns `undefined`, and the caller must not render.** This is #92's blank widget in
 * its second incarnation: react-router's `Router` returns `null` on a basename miss, silently, so a
 * host whose server serves our page from outside the configured prefix would show nothing at all
 * with every gate green. Reporting it and degrading is the whole reason this is ours rather than
 * `Router`'s `basename`.
 */
export function routeFromPathname(
  pathname: string,
  prefix: string,
  search?: string | null,
): string | undefined {
  if (prefix !== '' && !pathname.startsWith(prefix)) return undefined

  // A prefix must match on a segment boundary: `/mapped` is not inside `/map`.
  const rest = pathname.slice(prefix.length)

  if (prefix !== '' && rest !== '' && !rest.startsWith('/')) return undefined

  const route = rest === '' ? '/' : rest

  if (safePath(route) === undefined) return undefined

  // ⚠ The widget's own query rides on the REAL query string in path mode, unlike query mode where
  // the whole route including its search is packed into one parameter. That is the trade path mode
  // exists to make: the host has dedicated this URL space to the widget, so clean paths mean the
  // filters are readable too. Foreign params are preserved on write (`pathHrefFor`), so a host's
  // own `?utm_source` survives a navigation.
  const own = ownSearch(search)

  return own === '' ? route : `${route}?${own}`
}

/**
 * The widget's own parameters, filtered out of a host page's query string.
 *
 * We never claim a param we do not own: anything not in this list belongs to the host and is
 * neither read into the route nor dropped when we write.
 */
const WIDGET_PARAMS = new Set(['q', 'center', 'bbox', 'cc', 'sort', 'filters', 'locale'])

function ownSearch(search: string | null | undefined): string {
  try {
    const params = new URLSearchParams(search ?? '')
    const mine = new URLSearchParams()

    for (const [key, value] of params) if (WIDGET_PARAMS.has(key)) mine.append(key, value)

    return mine.toString().replace(/%2F/g, '/').replace(/%2C/g, ',')
  } catch {
    return ''
  }
}

/**
 * The absolute URL for a widget route under `prefix`, on the host's own page — path mode's
 * counterpart to {@link hrefFor}.
 *
 * Same three guarantees as the query form: absolute (so middle-click and "copy link" work and a
 * `<base href>` cannot redirect it), the host's foreign parameters preserved, and ours replaced
 * rather than appended. The difference is only where the route lives.
 */
export function pathHrefFor(href: string, route: string, prefix: string): string {
  try {
    const url = new URL(href)
    const [routePath, routeSearch = ''] = route.split('?')

    url.pathname = `${prefix}${routePath === '/' && prefix !== '' ? '' : routePath}`

    // Drop only our own params, then re-add whatever this route carries. A host param the widget
    // has never heard of survives untouched, which is the same courtesy `hrefFor` extends.
    const params = new URLSearchParams(url.search)

    for (const key of WIDGET_PARAMS) params.delete(key)
    for (const [key, value] of new URLSearchParams(routeSearch)) params.append(key, value)

    url.search = params.toString().replace(/%2F/g, '/').replace(/%2C/g, ',')

    return url.toString()
  } catch {
    return ''
  }
}

/**
 * The absolute URL for a widget route on the host's own page.
 *
 * **Absolute, not relative, and that is load-bearing three times over.** It is what makes an
 * in-widget `<Link>` a real, shareable URL — the middle-click bug #92 and #142 both deferred, where
 * an href resolved against the host origin and opened a 404. It closes a protocol-relative hole:
 * a host served at a doubled path has `location.pathname === '//classes'`, and a relative href
 * would then read as `//classes?atlas=…`, which is cross-origin. And it cannot be redirected by a
 * `<base href>` on the host's page, which react-router's own hash history special-cases for the
 * same reason.
 *
 * **The host's other parameters survive, and ours is replaced rather than appended.** WordPress's
 * default permalink is `/?p=123`, which is precisely this feature's audience, so dropping the
 * host's query would break the link on exactly the sites this exists for.
 *
 * The parameter is written even for the root route. Omitting it there would make "no parameter"
 * mean two different things — the embed's default route, and the root — and the reader has no way
 * to tell which.
 */
export function hrefFor(href: string, route: string): string {
  try {
    const url = new URL(href)

    url.searchParams.set(ROUTE_PARAM, route)

    // `URLSearchParams` percent-encodes `/` and `,` on serialize, so the readable form is restored
    // afterwards rather than by building the query by hand — which would mean re-implementing the
    // host's own parameter encoding and getting it subtly wrong.
    url.search = url.search.replace(/%2F/g, '/').replace(/%2C/g, ',')

    return url.toString()
  } catch {
    // A page whose URL will not parse cannot be linked into. The caller renders inert content
    // rather than an href, which is the same degradation `isSafeHref` already produces.
    return ''
  }
}
