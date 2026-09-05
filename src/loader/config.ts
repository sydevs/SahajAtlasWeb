/**
 * The widget's one configuration surface: the query string on the loader's own `<script src>`
 * (#149).
 *
 * ```html
 * <script type="module" src="https://atlas.example/auto.js?key=…&map=false&locale=fr"></script>
 * ```
 *
 * **Why the script URL, and not HTML attributes.** Every earlier version used attributes. The
 * widget must install on platforms that rewrite host markup. Attributes are the part that does
 * not survive that rewrite:
 *
 * - WordPress runs `wp_kses` over saved content for anyone below Administrator, and for every
 *   Site Administrator on multisite. It strips unknown attributes. It strips `<script>` outright.
 * - Wix's Custom Element takes a bare "Server URL" plus its own attribute panel. An
 *   attribute-configured widget would need a second, editor-driven configuration path there.
 *
 * Putting every parameter in the URL gives one mechanism everywhere. A sanitizer can then destroy
 * only the whole script tag. That failure is obvious, unlike a widget that mounts with half its
 * configuration silently missing.
 *
 * **What this deliberately leaves out matters as much as what it keeps.** This removed two
 * classes of setting, rather than porting them:
 *
 * - **Identity — the display name and the brand colours — belongs to the client record**, not to
 *   whoever pasted the snippet. A tenant's name and palette stay the same on every page it embeds
 *   on. Making them per-embed would let two pages of one site disagree about the product's name.
 *   It would also hand a branding decision to whoever copies a script tag.
 * - **There are no privacy opt-outs.** `analytics`, `geolocation`, and `error-reporting` are gone.
 *   Analytics is cookieless and aggregate. Crash reports carry no cookies, breadcrumbs, or session
 *   replay, and reduce the host page to origin plus path. The IP lookup is a keyless,
 *   once-per-session city lookup. An IP is personal data in the EU, and the visitor is on the
 *   HOST's page. So if a host ever needs to refuse a flow, the setting belongs on the client
 *   record. The embed URL is not where somebody else's compliance posture should live. Anyone who
 *   can edit a page can change it.
 *
 * There is exactly one way to configure each setting. Do not add a second.
 */
import { safeLoaderPath } from './literals'

export type RoutingMode = 'query' | 'path'

/** The query parameter the widget's route rides on, and the name of the boot-route setting. */
export const ROUTE_PARAM = 'atlas'

export type LoaderConfig = {
  /** The published SahajCloud client key. `null` when absent — the widget shows its config error. */
  key: string | null
  /** Render the Mapbox canvas. */
  map: boolean
  /** Force a UI language. Otherwise use the client record, then `?locale=`, then the browser. */
  locale?: string
  /** Where the widget's route lives. */
  routing: RoutingMode
  /**
   * The route to open when the page's own URL does not already name one.
   *
   * This value comes from `resolveRoute` below, not read raw. A route already in the page's
   * `?atlas=` always wins. That is a visitor who navigated or followed a link. Sending them
   * elsewhere would discard where they asked to go.
   */
  route?: string
  /**
   * Did that route come from the PAGE's `?atlas=`, rather than the script URL's?
   *
   * The two mean opposite things, and `route` above cannot tell them apart once resolved. A page
   * route means a visitor followed a link, so the widget mounts **eagerly** and opens straight
   * onto it. A script route is the host's default view, so the widget stays lazy and opens
   * nothing. This same boolean feeds `MountDecision.fromPage`, so the eager decision and the
   * auto-open decision cannot disagree.
   */
  routeFromPage: boolean
}

/**
 * The two spellings that switch something off, and nothing else.
 *
 * This is a duplicate of `attributeEnabled` (`src/config/attributes.ts`). The loader cannot
 * import from the widget at runtime without undoing the bundle split, so `literals.test.ts` pins
 * the two copies to match. The reasoning stays the same after the move from attributes to query
 * parameters. An integrator writes `false` or `0` to disable a setting, and **anything else must
 * leave it on**. A typo can never silently disable a flow the host relies on. This does mean
 * `map=no` does not do what it looks like it does — `docs/embedding.md` states this.
 */
const enabled = (value: string | null): boolean => value !== 'false' && value !== '0'

/**
 * `path` only when asked for by name. Anything else is the default, and needs no host config.
 *
 * There is no `mount` parameter to go with it. Path routing needs to know which part of the
 * pathname belongs to the host, and which part belongs to the widget. This code cannot work
 * that out here. On a deep link, the loader sees `/map/nl/amsterdam`. It cannot tell where the
 * host's part ends, because the region tree has not loaded yet. This value is also the *same*
 * value SahajCloud uses to compose canonical URLs. A second copy on the script URL could disagree
 * with the one the canonical was built from. A canonical that names a URL that does not restore
 * the view is exactly the failure the canonical work exists to prevent. This setting comes from
 * the client record.
 */
const routingMode = (value: string | null): RoutingMode => (value === 'path' ? 'path' : 'query')

/** Absent and empty are the same answer — an empty `locale=` is not a language. */
const text = (value: string | null): string | undefined => value || undefined

/**
 * Where the widget should open: the page's own route if it has one, otherwise the embed's
 * default.
 *
 * The precedence is the whole point. `?atlas=` on the **page** URL means a visitor deep-linked,
 * navigated, or followed a shared link, so it always wins. `atlas=` on the **script** URL is the
 * host saying "when nobody asked for anything in particular, start here". That is the same thing
 * the old `base-path` attribute meant. It is now expressed in the route's own vocabulary,
 * instead of as a second name for the same idea.
 *
 * Both sources pass through `safeLoaderPath`, including the page's. A route is a route wherever
 * it comes from. A hostile `?atlas=//evil.example` on a clicked link is the more likely of the
 * two to be an attack.
 */
export function resolveRoute(
  scriptValue: string | null,
  pageSearch: string | null | undefined,
): { route?: string; fromPage: boolean } {
  let raw: string | null = null

  try {
    raw = new URLSearchParams(pageSearch ?? '').get(ROUTE_PARAM)
  } catch {
    raw = null
  }

  const fromPage = safeLoaderPath(raw)

  // `fromPage` is the GUARDED value, not the raw presence of the parameter. A hostile
  // `?atlas=//evil.example` that `safeLoaderPath` rejects must not count as a deep link.
  // Otherwise the widget would mount eagerly and auto-open on a route it refused to honour.
  if (fromPage) return { route: fromPage, fromPage: true }

  return { route: safeLoaderPath(scriptValue), fromPage: false }
}

/**
 * Parse a loader script URL into the widget's configuration.
 *
 * This function takes both URLs as strings, so the whole thing is testable in the node lane with
 * no DOM. A URL that will not parse yields defaults instead of throwing. This code runs before
 * anything is on screen, in a page this project does not own. A throw here would take the host's
 * own scripts down with it. The widget's configuration-error screen is a better failure than a
 * broken page.
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

  const { route, fromPage } = resolveRoute(params.get(ROUTE_PARAM), pageSearch)

  return {
    key: params.get('key') || null,
    map: enabled(params.get('map')),
    locale: text(params.get('locale')),
    routing: routingMode(params.get('routing')),
    route,
    routeFromPage: fromPage,
  }
}
