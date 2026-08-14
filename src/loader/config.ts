/**
 * The widget's one configuration surface: the query string on the loader's own `<script src>`
 * (#149).
 *
 * ```html
 * <script src="https://atlas.example/auto.js?key=…&map=false&locale=fr"></script>
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
 * missing. It is also why the plugin path exists at all: plugin-emitted markup never passes
 * through `wp_kses`.
 *
 * Nothing reads an HTML attribute any more. Do not add one back "just for this case" — the rule
 * this file exists to enforce is that there is exactly one way to configure the widget.
 */
import { safeLoaderPath } from './literals'

export type RoutingMode = 'query' | 'path'
export type CompactMode = 'auto' | 'always' | 'never'

export type LoaderConfig = {
  /** The published SahajCloud client key. `null` when absent — the widget shows its config error. */
  key: string | null
  /** Render the Mapbox canvas. */
  map: boolean
  /** Force a UI language; otherwise the client record, then `?locale=`, then the browser. */
  locale?: string
  /** Where the widget's route lives. `path` additionally needs `mount`. */
  routing: RoutingMode
  /** Path mode only: the host pathname prefix the widget is served under, e.g. `/map`. */
  mount?: string
  /** Per-embed display name, overriding the client record's. */
  name?: string
  /** Per-embed brand overrides (hex). Omitted roles fall back to the client record. */
  primaryColor?: string
  secondaryColor?: string
  analytics: boolean
  geolocation: boolean
  errorReporting: boolean
  /** Whether to degrade to the compact card in a slot too small for the full interface. */
  compact: CompactMode
  /**
   * The route to boot at when the URL names none.
   *
   * ⚠ Slated for removal by the routing rework: under query routing the host's own page URL
   * carries `?atlas=/507/register`, which serves the documented registration-embed case through
   * the mechanism that already exists, and the default view otherwise comes from the client
   * record's home region. It is parsed here so this change is a pure move of the configuration
   * *surface* and drops no existing capability on the way.
   */
  basePath?: string
}

/**
 * The two spellings that switch something off, and nothing else.
 *
 * Carried over verbatim from `attributeEnabled` (`src/config/attributes.ts`) because the
 * reasoning is unchanged by the move from attributes to query params: an integrator writes
 * `false` or `0` to disable a thing, and **anything else must leave it on**. A typo can never
 * silently disable a flow the host is relying on — which does mean `geolocation=no` does not do
 * what it looks like it does, and `docs/embedding.md` says so.
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

/** `path` only when asked for by name; anything else is the default that needs no host config. */
const routingMode = (value: string | null): RoutingMode => (value === 'path' ? 'path' : 'query')

/** Absent and empty are the same answer — an empty `locale=` is not a language. */
const text = (value: string | null): string | undefined => value || undefined

/**
 * Parse a loader script URL into the widget's configuration.
 *
 * Takes the URL as a string so the whole thing is testable in the node lane with no DOM. A URL
 * that will not parse yields defaults rather than throwing: this runs before anything is on
 * screen, in a page we do not own, and a throw here would take the host's own scripts down with
 * it. The widget's configuration-error screen is a better failure than a broken page.
 */
export function parseConfig(scriptSrc: string | null | undefined): LoaderConfig {
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
    // Host-supplied and reaches a route, so it is guarded exactly as `webPath` is: an absolute
    // URL, `//evil.example` or a TAB/LF/CR variant yields `undefined`, and path mode then has no
    // prefix to strip and reports itself rather than mounting somewhere unintended.
    mount: safeLoaderPath(params.get('mount')),
    name: text(params.get('name')),
    primaryColor: text(params.get('primary-color')),
    secondaryColor: text(params.get('secondary-color')),
    analytics: enabled(params.get('analytics')),
    geolocation: enabled(params.get('geolocation')),
    errorReporting: enabled(params.get('error-reporting')),
    compact: compactMode(params.get('compact')),
    basePath: safeLoaderPath(params.get('base-path')),
  }
}
