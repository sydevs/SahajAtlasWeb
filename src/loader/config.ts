/**
 * The widget's one configuration surface: the query string on the loader's own `<script src>`
 * (#149).
 *
 * ```html
 * <script type="module" src="https://atlas.example/auto.js?key=…&map=false&locale=fr"></script>
 * ```
 *
 * **Why the script URL and not HTML attributes**, which is what every version before this used.
 * The widget has to install on platforms that rewrite host markup, and attributes are the half
 * that does not survive:
 *
 * - WordPress runs `wp_kses` over saved content for anyone below Administrator (and for *every*
 *   Site Administrator on multisite). It strips unknown attributes, and `<script>` outright.
 * - Wix's Custom Element takes a bare "Server URL" plus its own attribute panel, so an
 *   attribute-configured widget needs a second, editor-driven configuration path.
 *
 * Putting every parameter in the URL collapses that to one mechanism which is identical
 * everywhere, and it means the only thing a sanitizer can destroy is the whole script tag — a
 * failure that is obvious, rather than a widget that mounts with half its configuration silently
 * missing.
 *
 * **What is deliberately NOT here matters as much as what is.** Two whole classes of setting were
 * removed rather than ported:
 *
 * - **Identity — the display name and the brand colours — belongs to the client record**, not to
 *   whoever pasted the snippet. A tenant's name and palette are the same on every page they embed
 *   on; making them per-embed invites two pages of one site disagreeing about what the product is
 *   called, and puts a branding decision in the hands of an editor copying a script tag.
 * - **There are no privacy opt-outs.** `analytics`, `geolocation` and `error-reporting` are gone.
 *   Analytics is cookieless and aggregate, crash reports carry no cookies, breadcrumbs or session
 *   replay and reduce the host page to origin + path, and the IP lookup is a keyless once-per-
 *   session city lookup. Worth knowing if this is ever revisited: an IP is personal data in the
 *   EU and the visitor is on the HOST's page, so if a host ever does need to refuse a flow, the
 *   answer is a client-record setting — the embed URL is not where somebody else's compliance
 *   posture should live, because anyone who can edit a page can change it.
 *
 * There is exactly one way to configure each thing. Do not add a second.
 */
import { safeLoaderPath } from './literals'

export type RoutingMode = 'query' | 'path'
export type CompactMode = 'auto' | 'always' | 'never'

/** The query parameter the widget's route rides on, and the name of the boot-route setting. */
export const ROUTE_PARAM = 'atlas'

export type LoaderConfig = {
  /** The published SahajCloud client key. `null` when absent — the widget shows its config error. */
  key: string | null
  /** Render the Mapbox canvas. */
  map: boolean
  /** Force a UI language; otherwise the client record, then `?locale=`, then the browser. */
  locale?: string
  /** Where the widget's route lives. */
  routing: RoutingMode
  /** Whether to degrade to the compact card in a slot too small for the full interface. */
  compact: CompactMode
  /**
   * The route to open at when the page's own URL does not already name one.
   *
   * Resolved by `resolveRoute` below, not read raw: a route already in the page's `?atlas=` always
   * wins, because that is a visitor who navigated or followed a link, and sending them somewhere
   * else would discard where they asked to be.
   */
  route?: string
}

/**
 * The two spellings that switch something off, and nothing else.
 *
 * A duplicate of `attributeEnabled` (`src/config/attributes.ts`) — the loader cannot import from
 * the widget at runtime without undoing the bundle split, so `literals.test.ts` pins the two.
 * The reasoning is unchanged by the move from attributes to query params: an integrator writes
 * `false` or `0` to disable a thing, and **anything else must leave it on**. A typo can never
 * silently disable a flow the host is relying on — which does mean `map=no` does not do what it
 * looks like it does, and `docs/embedding.md` says so.
 */
const enabled = (value: string | null): boolean => value !== 'false' && value !== '0'

/**
 * A three-valued parameter, with the same protective bias as `enabled`.
 *
 * `compact` cannot use `enabled` — it has three states — but it keeps the principle that matters:
 * **an unrecognised value resolves to the adaptive default, never to the destructive one.** A
 * host who typos `compact=allways` gets automatic behaviour, not a widget permanently locked into
 * a small card. The boolean spellings are accepted as synonyms so that a host reasoning by
 * analogy from the documented `false`/`0` rule gets the sensible answer instead of silence.
 */
const compactMode = (value: string | null): CompactMode => {
  if (value === 'always' || value === '1' || value === 'true') return 'always'
  if (value === 'never' || value === '0' || value === 'false') return 'never'

  return 'auto'
}

/**
 * `path` only when asked for by name; anything else is the default that needs no host config.
 *
 * Note there is no `mount` parameter to go with it. Path routing needs to know which prefix of
 * the pathname belongs to the host and which to the widget, and that cannot be worked out here:
 * on a deep link the loader sees `/map/nl/amsterdam` and has no way to tell where the host's part
 * ends without the region tree, which has not loaded yet. It is also the *same* value SahajCloud
 * composes canonical URLs from, so a second copy on the script URL could disagree with the one
 * the canonical was built from — and a canonical that names a URL not restoring the view is
 * exactly the failure the canonical work exists to prevent. It comes from the client record.
 */
const routingMode = (value: string | null): RoutingMode => (value === 'path' ? 'path' : 'query')

/** Absent and empty are the same answer — an empty `locale=` is not a language. */
const text = (value: string | null): string | undefined => value || undefined

/**
 * Where the widget should open: the page's own route if it has one, else the embed's default.
 *
 * The precedence is the whole point. `?atlas=` on the **page** URL is a visitor who deep-linked,
 * navigated, or followed a shared link, so it always wins; `atlas=` on the **script** URL is the
 * host saying "when nobody asked for anything in particular, start here" — which is what the old
 * `base-path` attribute meant, expressed in the same vocabulary as the route itself rather than a
 * second name for the same idea.
 *
 * Both are guarded by `safeLoaderPath`, including the page's: a route is a route wherever it came
 * from, and a hostile `?atlas=//evil.example` on a link somebody clicked is the more likely of the
 * two to be adversarial.
 */
export function resolveRoute(
  scriptValue: string | null,
  pageSearch: string | null | undefined,
): string | undefined {
  let fromPage: string | null = null

  try {
    fromPage = new URLSearchParams(pageSearch ?? '').get(ROUTE_PARAM)
  } catch {
    fromPage = null
  }

  return safeLoaderPath(fromPage) ?? safeLoaderPath(scriptValue)
}

/**
 * Parse a loader script URL into the widget's configuration.
 *
 * Takes both URLs as strings so the whole thing is testable in the node lane with no DOM. A URL
 * that will not parse yields defaults rather than throwing: this runs before anything is on
 * screen, in a page we do not own, and a throw here would take the host's own scripts down with
 * it. The widget's configuration-error screen is a better failure than a broken page.
 */
export function parseConfig(
  scriptSrc: string | null | undefined,
  pageSearch: string | null | undefined = '',
): LoaderConfig {
  let params: URLSearchParams

  try {
    params = new URL(String(scriptSrc), 'https://invalid.example').searchParams
  } catch {
    params = new URLSearchParams()
  }

  return {
    key: params.get('key') || null,
    map: enabled(params.get('map')),
    locale: text(params.get('locale')),
    routing: routingMode(params.get('routing')),
    compact: compactMode(params.get('compact')),
    route: resolveRoute(params.get(ROUTE_PARAM), pageSearch),
  }
}
