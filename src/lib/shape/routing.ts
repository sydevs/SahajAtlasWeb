/**
 * Where the widget's route lives in the host page's URL (#154).
 *
 * The widget used to route off the URL fragment (`#!/gb/london`). It now routes off a
 * **query parameter** on the host's own URL:
 *
 * ```
 * https://sahajayoga.nl/classes?atlas=/nl/amsterdam/1204
 * ```
 *
 * **The reason, in one sentence: a fragment is never an indexable URL, and a query
 * string is.** No search engine has ever treated `#x` as a distinct page. The `#!`
 * AJAX-crawling scheme was deprecated in 2015, and dropped in 2018. So under hash
 * routing, every event on every embed was the same URL to a crawler. A query parameter
 * also needs no wildcard rewrite. That is what makes it work identically on WordPress,
 * Wix, Weebly, and Joomla. Testing measured it surviving `replaceState`, two animation
 * frames, 2.5s of runtime boot, and a cold deep-link load, on two live Wix sites.
 *
 * This change also deletes a whole class of bug, instead of adding a mode. The widget
 * no longer has any opinion about the host's `#anchor`. The three-way ours/free/foreign
 * decision, the blank-widget failure of #92, and the two spellings react-router used to
 * normalise between, are all simply gone.
 *
 * This module is pure. It never touches `window`, so the whole decision is testable in
 * the node lane. `atlas-history.ts` is the part that touches `history`.
 */
import { safePath } from './path'
import { encodeParamValue, searchWith, searchWithout } from './query'

/**
 * The query parameter the route rides on.
 *
 * **This duplicates `ROUTE_PARAM` from `src/loader/config.ts`, deliberately.** The
 * loader is a separate build entry whose whole point is to stay about 3 KiB. So it must
 * not import from the widget, and the widget must not pull it into a shared chunk.
 * `src/loader/literals.test.ts` pins the two copies together. `src/lib/element.ts` uses
 * the same arrangement for the element name.
 *
 * `atlas` is not a WordPress reserved query var. `embed` **is** one. `map` is
 * disqualified twice over: it is too generic, and the widget already means something
 * else by it.
 */
export const ROUTE_PARAM = 'atlas'

/** How the widget's route reaches the URL. */
export type RouterMode = 'query' | 'path' | 'memory'

export type MountDecision = {
  mode: RouterMode
  /** The route to boot at. */
  path: string
  /**
   * The URL shape actually in effect: what an observer of this page would *find*, as
   * opposed to the `routing` parameter, which is what somebody asked for (#153).
   *
   * The two differ whenever `path` was requested and could not be honoured. That
   * happens with no prefix on the client record, or a page served outside it. In that
   * case this field reads `query`, and `warning` says why. The readiness marker attests
   * this value, and a marker carrying a request, rather than a finding, is worth
   * nothing to the verifier reading it. Memory is a degradation of the query shape, not
   * a third shape. The route is not in the URL at all there, which the marker says
   * through `urlWritable` instead.
   */
  routing: 'query' | 'path'
  /** The resolved path prefix, when `mode === 'path'`. The router composes hrefs from it. */
  prefix?: string
  /**
   * Whether `path` came from the page's `?atlas=`, rather than the embed's configured
   * default.
   *
   * These are two very different facts, and `path` alone cannot distinguish them once
   * resolved. A page route means a visitor deep-linked, or followed a shared link. A
   * script route means the host is saying "start here when nobody asked". Only the
   * first earns the compact card opening itself on mount. Otherwise every host who
   * configures a default view would get a full-screen overlay over their content on
   * every page load.
   */
  fromPage: boolean
  /** Set when the requested mode could not be honoured, for the caller to report. */
  warning?: string
}

/**
 * Encodes a widget route as a parameter value.
 *
 * This restores `/` and `,` after encoding. Both are explicitly legal in a query value
 * (RFC 3986: `query = *( pchar / "/" / "?" )`), and both appear constantly. Every route
 * is slash-separated, and `?center=4.9,52.3` is a comma pair. Leaving them encoded
 * would turn the one thing that has to stay readable in a shared link,
 * `?atlas=%2Fnl%2Famsterdam%2F1204`, into noise.
 *
 * `?` is deliberately left encoded. It is legal too, but a raw `?` inside the value
 * makes it ambiguous at a glance whether a nested query belongs to the widget or to the
 * host. The two saved characters are not worth that.
 *
 * The encoding itself is `encodeParamValue` (`query.ts`), the same one every other
 * parameter the widget writes goes through. `?atlas=` cannot drift from the rest. This
 * function's name carries the route-shaped reasoning above. The implementation is
 * shared.
 */
export const routeToParam = (route: string): string => encodeParamValue(route)

/**
 * Reads a widget route out of a host page's query string.
 *
 * This is guarded by `safePath`, so `?atlas=//evil.example`, `?atlas=javascript:…`, and
 * the TAB/LF/CR variants all yield `undefined`, instead of a route. `webPath` gets the
 * same guard, but this case needs it more: this value arrives on a link somebody
 * clicked.
 *
 * The function never throws. A malformed query string is a page we do not own, and a
 * route is not worth taking the host's scripts down for.
 */
export function routeFromParam(search: string | null | undefined): string | undefined {
  try {
    return safePath(new URLSearchParams(search ?? '').get(ROUTE_PARAM))
  } catch {
    return undefined
  }
}

/**
 * Decides which router to mount, and where to start.
 *
 * **Path mode needs two things, and refuses loudly without either.** It needs a prefix
 * (from the client record's `canonical.embed`, via `mountPrefix`) and a pathname
 * actually under that prefix. Memory outranks both: a route this widget cannot write is
 * a route nobody can link to. Every refusal degrades to query, and names its cause. A
 * routing mode that silently behaves as a different one is how a host concludes their
 * server config is working when nothing is using it.
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
   * `undefined` means the record has not arrived, or supplies nothing usable. Path mode
   * cannot be honoured without it — see the fallback below.
   */
  prefix?: string
  /** The embed's default route, already resolved by the loader (page wins over script). */
  route?: string
  /** Whether the URL can be written at all. `undefined` means nobody probed — assume it can. */
  urlWritable?: boolean
}): MountDecision {
  const { routing, search, pathname, prefix, route, urlWritable } = input

  // A route already in the page's URL always wins. That visitor deep-linked, or
  // followed a shared link. The embed's default is only ever an answer to "nobody
  // asked for anything".
  //
  // This reads the page route into its own binding, instead of inlining it. Whether
  // there was one is a fact the tree needs (`fromPage`), and it is unrecoverable from
  // `path` afterwards. This cannot be derived by comparing against `route`: the
  // loader's `resolveRoute` has already folded the page route into it.
  const pageRoute = routeFromParam(search)

  // Every outcome but path mode makes the same decision: boot at the page's route, or
  // the embed's default, with the route in `?atlas=`. Only `mode`, and whether we owe
  // the host an explanation, vary. Memory is included deliberately. It is a
  // degradation of the query shape, which is why it reports `routing: 'query'`.
  // Saying that once here beats repeating it at each return.
  const queryMode = (mode: 'query' | 'memory', warning?: string): MountDecision => ({
    mode,
    path: pageRoute ?? route ?? '/',
    routing: 'query',
    fromPage: pageRoute !== undefined,
    warning,
  })

  // ⚠ Memory outranks everything, path included. A route this widget cannot write is a
  // route nobody can link to. Any URL-backed router over it would fail on the
  // visitor's first click, instead of at boot.
  if (urlWritable === false) return queryMode('memory')

  if (routing !== 'path') return queryMode('query')

  // The record has not arrived, or carries no usable mount. Both cases get the same
  // answer: fall back to query, and say so. A routing mode that silently behaves as a
  // different one is how a host concludes their server config is working when nothing
  // is using it.
  if (prefix === undefined) {
    return queryMode(
      'query',
      'routing=path needs a canonical embed on your client record to know which path prefix ' +
        'the widget is mounted under. The widget is using query routing instead.',
    )
  }

  const fromPath = routeFromPathname(pathname ?? '/', prefix, search)

  // ⚠ This catches the basename miss (#92), instead of handing it to react-router.
  // react-router's `Router` renders `null` on one, silently, which produces a blank
  // widget on somebody's page.
  if (fromPath === undefined) {
    return queryMode(
      'query',
      `routing=path expected this page to be served under "${prefix}", and it is not. ` +
        'The widget is using query routing instead — check that the canonical embed on your ' +
        'client record names the page the widget is actually mounted on.',
    )
  }

  // In path mode the pathname is the route, so it always came from the page. There is
  // no "nobody asked" state that falls back to a configured default. The host's server
  // chose to serve us this URL.
  return { mode: 'path', path: fromPath, routing: 'path', fromPage: fromPath !== '/', prefix }
}

/**
 * The path prefix a `path`-routed widget lives under, from the client record's
 * `canonical.embed`.
 *
 * `canonical.embed` is a **mount key**: a host joined to a pathname, as `splitMountKey`
 * records it on the SahajCloud side (`wemeditate.com/map`). Both halves matter here:
 *
 * - the **path** becomes the prefix, and
 * - the **host** must match the page this widget is running on, or the function
 *   refuses.
 *
 * ⚠ **Matching the host is not optional, though an earlier draft of this comment said
 * it was** ("being on the wrong host is a canonical-ownership question"). It is a
 * routing question instead. The prefix is the only thing confining path mode to a
 * subtree, and a client may nominate one embed while running others elsewhere. Without
 * the check, a record naming `wemeditate.com/map` would happily root a widget on a
 * different host's `/account/settings`, and rewrite that URL on the first click.
 *
 * This returns `''` for a root mount, and `undefined` when there is nothing usable. The
 * caller must treat that as "cannot honour path routing", not as "mount at the root".
 * Those are different, and conflating them is the sharp edge. `routeFromPathname`
 * short-circuits its segment-boundary check when the prefix is empty, so a `''`
 * reached by accident disables the #92 basename-miss guard entirely — the stated
 * reason this check is ours rather than `Router`'s `basename`. So a root mount has to
 * be spelled with a trailing slash (`sahajayoga.nl/`), exactly as `splitMountKey`
 * writes it. A bare host, a typo, or anything else slashless is refused, instead of
 * silently claiming the whole origin.
 */
export function mountPrefix(
  embed: string | null | undefined,
  currentHost: string | null | undefined,
): string | undefined {
  if (typeof embed !== 'string' || embed.trim() === '') return undefined

  const trimmed = embed.trim()

  // This tolerates a scheme even though the stored form has none. An operator pasting
  // a full URL into the picker is the obvious mistake, and refusing it would be a
  // silent fallback to query.
  //
  // ⚠ **The `//` is required, and making it optional broke a real case.** A mount key
  // keeps the port (`splitMountKey` records `url.host`), so `localhost:5173/pathmode`
  // has a colon before its first slash. An optional `//` would then parse
  // `localhost:` as the scheme, leaving host `5173`, which matches nothing. A browser
  // test found this after a review suggested loosening it to refuse `javascript:`.
  // That concern is already covered: a schemeless `javascript:alert(1)` has no slash,
  // and the slashless rule below refuses it.
  const withoutScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  const slash = withoutScheme.indexOf('/')

  // No slash at all is not a root mount. It is a malformed key. `splitMountKey` always
  // writes at least the `/` of the pathname, so a value without one did not come from
  // a reported embed.
  if (slash === -1) return undefined

  const host = withoutScheme.slice(0, slash)
  const rawPath = withoutScheme.slice(slash)

  // The record names the page the widget is mounted on. If that is not this page's
  // host, path routing is not ours to do here, whatever the CMS says about ownership.
  if (!currentHost || host.toLowerCase() !== currentHost.toLowerCase()) return undefined

  // ⚠ Runs `safePath` before the trailing-slash strip, not after. `host//` normalises
  // to `''`, and would otherwise reach the root-mount return without ever meeting the
  // guard. `//evil.com` is the single input shape that guard exists for.
  if (safePath(rawPath) === undefined) return undefined

  // A root mount is `/`, and stays the empty prefix, so `${prefix}${route}` never
  // doubles a slash.
  return rawPath.replace(/\/+$/, '')
}

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

  const query = queryFromParam(search)

  return query === undefined ? route : `${route}?${query}`
}

/**
 * The widget's transient state in `path` routing: the route's query, read out of
 * `?atlas=`.
 *
 * **One parameter serves both modes, and this is the second version of it.** The first
 * version put the widget's state on the host's real query string, governed by an
 * allowlist of the twelve names the widget owns. Both ways of getting that list wrong
 * were silent. A missing name dropped a filter on every navigation. A surplus one
 * stole a parameter from the host. That version also forced a host-facing promise
 * enumerating twelve names this widget takes over on their pages.
 *
 * So path mode now carries its state the same way query mode always has: in `?atlas=`.
 * The rule is one sentence: **`?atlas=` carries whatever the path does not.** In query
 * mode the path carries nothing, so the parameter holds the whole route. In path mode
 * the pathname holds the route's path, so the parameter holds only its query. One name
 * is claimed on a host's URL either way, with one encoder, and one collision to
 * document.
 *
 * This costs nothing where it matters. The URLs that must stay indexable and
 * shareable — a region, a venue, an event — carry no query at all. Every `webPath` in
 * `atlas-url-contract.json` is path-only. Filters and a sort order are a reading
 * position, and `?atlas=center=4.9,52.3` is no worse a thing to look at than the
 * packed form query mode has always shown.
 */
function queryFromParam(search: string | null | undefined): string | undefined {
  try {
    const value = new URLSearchParams(search ?? '').get(ROUTE_PARAM)

    // A leading `/` means this is a query-mode route inside a path-mode URL: someone's
    // stale link, or a host who switched modes. This refuses it, instead of reading a
    // path as a query string.
    return value === null || value === '' || value.startsWith('/') ? undefined : value
  } catch {
    return undefined
  }
}

/**
 * The absolute URL for a widget route under `prefix`: path mode's counterpart to
 * {@link hrefFor}.
 *
 * This gives the same three guarantees as the query form. The URL is absolute, so
 * middle-click and "copy link" work, and a `<base href>` cannot redirect it. The
 * host's other parameters stay untouched. Ours is replaced, not appended. The only
 * difference is that the route's path goes in the pathname, leaving `?atlas=` to
 * carry its query — see {@link queryFromParam}.
 */
export function pathHrefFor(href: string, route: string, prefix: string): string {
  try {
    const url = new URL(href)
    const [routePath, routeSearch = ''] = route.split('?')

    url.pathname = `${prefix}${routePath === '/' && prefix !== '' ? '' : routePath}`

    // ⚠ This confines the result, because `safePath` does not do that on its own. It
    // only inspects the first two characters, so a CMS-authored `webPath` of
    // `/../../wp-admin` reads as "site-relative" under its rules. The URL parser then
    // resolves the dot segments, and walks the href straight out of the mount subtree
    // onto an unrelated page of the host's own site. This is not an origin escape
    // (the `pathname` setter cannot change the host). But it is an href that leaves
    // the widget, and a `pushState` that renames the visitor's page. `''` is the
    // refusal both this function and `isSafeHref` already agree on.
    if (prefix !== '' && url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`))
      return ''

    // This writes exactly one parameter, exactly as query mode does. Every other name
    // on the host's URL is none of our business in either mode now, and `query.ts`
    // makes that literally true, not just approximately. It edits our pair and
    // rejoins the rest verbatim.
    url.search =
      routeSearch === ''
        ? searchWithout(url.search, ROUTE_PARAM)
        : searchWith(url.search, ROUTE_PARAM, routeSearch)

    return url.toString()
  } catch {
    return ''
  }
}

/**
 * The absolute URL for a widget route on the host's own page.
 *
 * **This URL is absolute, not relative, and that choice is load-bearing three times
 * over.** It is what makes an in-widget `<Link>` a real, shareable URL. Bugs #92 and
 * #142 both deferred the middle-click case, where an href resolved against the host
 * origin and opened a 404. This also closes a protocol-relative hole: a host served
 * at a doubled path has `location.pathname === '//classes'`, and a relative href
 * would then read as `//classes?atlas=…`, which is cross-origin. And a host page's
 * `<base href>` cannot redirect it, for the same reason react-router's own hash
 * history special-cases this.
 *
 * **The host's other parameters survive, and ours is replaced instead of appended.**
 * WordPress's default permalink is `/?p=123`, which is precisely this feature's
 * audience. Dropping the host's query would break the link on exactly the sites this
 * exists for.
 *
 * The parameter is written even for the root route. Omitting it there would make "no
 * parameter" mean two different things: the embed's default route, and the root. The
 * reader would have no way to tell which.
 */
export function hrefFor(href: string, route: string): string {
  try {
    const url = new URL(href)

    // ⚠ Uses `searchWith` (the string editor), not `hrefWith` (the URL wrapper), and
    // the difference is load-bearing. `hrefWith` returns `''` when the value is
    // already there. That is right for `publishLocale`/`clearFeedback`, since both
    // mean "leave the URL alone", but it is catastrophic here. This function feeds
    // `createHref` for every `<Link>`, and a link to the route already on screen is
    // the commonest case in the app. So `''` would blank the href of every self-link
    // on the page.
    url.search = searchWith(url.search, ROUTE_PARAM, route)

    return url.toString()
  } catch {
    // A page whose URL will not parse cannot be linked into. The caller renders inert
    // content instead of an href. `isSafeHref` already produces the same degradation.
    return ''
  }
}
