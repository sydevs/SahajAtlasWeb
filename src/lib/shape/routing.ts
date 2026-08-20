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

/** How the widget's route reaches the URL. `path` is not implemented yet — see `mountDecision`. */
export type RouterMode = 'query' | 'memory'

export type MountDecision = {
  mode: RouterMode
  /** The route to boot at. */
  path: string
  /**
   * The URL shape actually in effect — what an observer of this page would *find*, as opposed to
   * the `routing` parameter, which is what somebody asked for (#153).
   *
   * The two differ, and this is the only place that knows it: `routing=path` is accepted here and
   * not honoured, so a widget configured for it query-routes anyway. The readiness marker attests
   * this value, and a marker carrying a request rather than a finding is worth nothing to the
   * verifier reading it. Memory is a degradation of the query shape rather than a third shape —
   * the route is not in the URL at all, which the marker says through `urlWritable` instead.
   */
  routing: 'query' | 'path'
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
  /** The embed's default route, already resolved by the loader (page wins over script). */
  route?: string
  /** Whether the URL can be written at all. `undefined` means nobody probed — assume it can. */
  urlWritable?: boolean
}): MountDecision {
  const { routing, search, route, urlWritable } = input

  const warning =
    routing === 'path'
      ? 'routing=path is not available yet — the widget is using query routing instead. ' +
        'The path prefix comes from your client record, which is not wired up yet.'
      : undefined

  // A route already in the page's URL always wins: that visitor deep-linked or followed a shared
  // link, and the embed's default is only ever an answer to "nobody asked for anything".
  //
  // Read the page route into its own binding rather than inlining it: whether there WAS one is a
  // fact the tree needs (`fromPage`), and it is unrecoverable from `path` afterwards. Note this
  // cannot be derived by comparing against `route` — the loader's `resolveRoute` has already
  // folded the page route into it.
  const pageRoute = routeFromParam(search)
  const path = pageRoute ?? route ?? '/'
  const fromPage = pageRoute !== undefined

  // Constant while `path` is accepted-but-not-honoured, and deliberately stated here rather than
  // at the two places that consume it. The warning above and this field are the same fact said
  // twice — one to the host, one to the verifier — so when path routing does arrive, it arrives
  // in this function and both follow.
  const effective = 'query' as const

  if (urlWritable === false) {
    return { mode: 'memory', path, routing: effective, fromPage, warning }
  }

  return { mode: 'query', path, routing: effective, fromPage, warning }
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
