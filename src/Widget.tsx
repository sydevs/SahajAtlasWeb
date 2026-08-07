import type { MountRoute } from './lib/shape'

import r2wc from '@r2wc/react-to-web-component'
import { HashRouter, MemoryRouter } from 'react-router'
import { useRef } from 'react'

import App, { RootBoundary } from './App'
import atlasAuth from './config/api/auth'
import privacy, { attributeEnabled } from './config/privacy'
import i18n from './config/i18n'
import { useLocale } from './hooks/use-locale'
import { getInitialTheme } from './hooks/use-theme'
import { reportIntegrationWarning, reportInternalError } from './lib/report'
import { WIDGET_SCOPE_CLASS } from './lib/scope'
import { HASH_BASE, mountRoute } from './lib/shape'

// Implementation of embeddable Widget
// Demo in: demo.html
// Based on: https://www.linkedin.com/pulse/converting-react-app-appendable-widget-using-web-mike-rahimi-wssnf/

const ELEMENT_NAME = 'sahaj-atlas'

type WidgetProps = {
  apiKey: string
  locale?: string
  basePath?: string
  // Render the map canvas? Default true; `map="false"` (or "0") renders content-
  // only (no Mapbox, no token needed) — the mode-agnostic <sahaj-atlas> element.
  map?: string
  // The two third-party data flows a host may have to decline, same "false"/"0"
  // spelling as `map` — see config/privacy.ts.
  analytics?: string
  geolocation?: string
  // Per-embed brand palette (hex). Each role overrides the client record's
  // color; omitted roles fall back to the record, then the built-in default.
  // (No `backgroundColor`: the page surface is a fixed default now.)
  primaryColor?: string
  secondaryColor?: string
}

/**
 * Act on the mount decision (`mountRoute`, `lib/shape/hash.ts`): take the URL fragment
 * when it's free, and degrade if the host won't let us.
 *
 * The write is a **`replaceState`**, never a `window.location.hash = …` assignment. An
 * assignment pushes a host history entry, so the visitor's first Back press would appear
 * to do nothing — the same host-history pollution `dismissAction` is careful to avoid on
 * every dismissal. `history.state` is passed through so whatever the host put there
 * survives.
 */
function claimFragment(route: MountRoute): MountRoute {
  if (!route.write) return route

  try {
    // Absolutised against the CURRENT location, not handed over as the bare `#!…`
    // reference it is. A relative argument to `replaceState` resolves against the document
    // BASE url, so on a host page carrying `<base href="/blog/">` a bare fragment would
    // rewrite the visitor's path and drop their query string; a cross-origin `<base>`
    // would throw instead, permanently downgrading that site to the memory branch below.
    // react-router's own hash history special-cases `<base>` for the same reason.
    const url = new URL(window.location.href)

    url.hash = route.write
    window.history.replaceState(window.history.state, '', url)

    return route
  } catch (error) {
    // A sandboxed iframe (or a `file://` document) can refuse a same-document
    // replaceState. Mounting a HashRouter over a fragment we failed to claim renders
    // nothing at all, so degrade to the off-URL routing the host-anchor case uses.
    reportInternalError(error, 'widget: could not claim the URL fragment')

    return { router: 'memory', path: route.path }
  }
}

/**
 * The custom element's React root. Nothing renders above this, which is why the outermost
 * boundary sits here rather than deeper: from here it also covers <Atlas>'s own render
 * body — the mount decision, the theme read, the i18n read — and the router itself, none
 * of which the boundary inside <App> is structurally able to see.
 */
export default function Widget(props: WidgetProps) {
  return (
    <RootBoundary>
      <Atlas {...props} />
    </RootBoundary>
  )
}

function Atlas({
  apiKey,
  locale,
  map,
  analytics,
  geolocation,
  basePath,
  primaryColor,
  secondaryColor,
}: WidgetProps) {
  if (!atlasAuth.apiKey) {
    atlasAuth.apiKey = apiKey
  }

  // Derived purely from props and idempotent, so a discarded render (see the
  // `useLocale` note below) writes the same values again. Read non-reactively by the
  // analytics block in App.tsx and by `useIpLocation`, both of which run after this.
  privacy.analytics = attributeEnabled(analytics)
  privacy.ipLookup = attributeEnabled(geolocation)

  // NB: the initial locale is applied by App's AppShell effect (from `defaultLocale`
  // below), which runs once on mount and again only if the host changes the prop.
  // Don't call i18n.changeLanguage here in the render body — it re-fired on every
  // render and clobbered a language the user picked from the settings menu.

  // Who owns the URL fragment, and where the widget boots — decided ONCE, on the first
  // render. Guarded to it because the root hash (`#!/`) recurs whenever the visitor
  // navigates back home and Widget re-renders reactively (locale changes): re-deciding
  // would teleport them back to `base-path`.
  //
  // `hash` is the normal case. `memory` is the host-anchor case (issue #92): a page
  // arriving at `#respond` used to render a BLANK widget, because react-router reads that
  // as a location outside the `!` basename. The widget now routes off-URL there instead of
  // overwriting an anchor that is not its to take — so the host's on-load scroll, and
  // anything of theirs that reads `location.hash` later, keep working.
  //
  // The memory branch costs three real things, all of them better than a blank widget but
  // none of them free: the widget's route isn't in the URL, so it can't be deep-linked or
  // shared from that page; browser Back leaves the host page instead of stepping back
  // through the widget; and in-widget link hrefs resolve against the host origin rather
  // than the fragment, so a middle-click opens a host URL that probably 404s.
  //
  // Re-entrancy: `useLocale` can suspend on a cold i18n boot, which makes React discard
  // and retry this render — recreating the ref and re-running `claimFragment`. That is
  // safe, and not by accident: the retry reads the hash the first pass just wrote, so
  // `mountRoute` returns it as a route and asks for no second write.
  const mount = useRef<MountRoute>()

  if (!mount.current) {
    mount.current = claimFragment(mountRoute(window.location.hash, basePath))
  }

  const hasMap = attributeEnabled(map)

  // The widget scopes its theme to this wrapper so it never mutates the host
  // page's <html>. Set the initial light/dark class synchronously to avoid a
  // flash; BrandTheme adopts the wrapper as the theme root + paints the brand
  // palette once mounted. `dir` derives from the ACTIVE locale (reactively) so
  // every descendant — and Tailwind's rtl: variants — follow text direction.
  // It also carries WIDGET_SCOPE_CLASS: every rule in our injected stylesheet is
  // rewritten to sit under that class (issue #91), so without it here the embed
  // renders completely unstyled. Same element as the theme class by necessity —
  // the scoped `dark:` / `rtl:` variants resolve both against one ancestor.
  const themeRootRef = useRef<HTMLDivElement>(null)
  const { locale: activeLocale, t } = useLocale()

  const atlas = (
    /* display:contents keeps the wrapper out of the layout while still
       carrying the theme class + brand CSS vars down to every descendant.
       `lang` tracks the ACTIVE locale alongside `dir`, because the host page's
       <html lang> is almost never the widget's: a French atlas on an English site
       was being announced with English pronunciation (WCAG 3.1.2, Language of
       Parts). Both attributes inherit down the DOM tree, which display:contents
       does not interrupt. `role="region"` + a localized name make the embed a
       landmark a screen-reader user can jump to and out of, rather than an
       unbounded run of content in the middle of somebody else's page. */
    <div
      ref={themeRootRef}
      aria-label={t('widget.label')}
      className={`${WIDGET_SCOPE_CLASS} ${getInitialTheme()}`}
      dir={i18n.dir(activeLocale)}
      lang={activeLocale}
      role="region"
      style={{ display: 'contents' }}
    >
      <App
        apiKey={apiKey}
        brand={{ primary: primaryColor, secondary: secondaryColor }}
        defaultLocale={locale}
        hasMap={hasMap}
        themeRootRef={themeRootRef}
      />
    </div>
  )

  // Never switches after the first render — `mount` is a ref — so this branch can't
  // remount the tree mid-session.
  return mount.current.router === 'hash' ? (
    <HashRouter basename={HASH_BASE}>{atlas}</HashRouter>
  ) : (
    <MemoryRouter initialEntries={[mount.current.path]}>{atlas}</MemoryRouter>
  )
}

// ===== THE CUSTOM ELEMENT ===== //

// r2wc's element implements three standard callbacks; the third, `attributeChangedCallback`,
// is the one that matters here — see the constructor below.
type AtlasElement = HTMLElement & {
  connectedCallback(): void
  disconnectedCallback(): void
}

/**
 * r2wc's own "am I connected" flag, a globally registered symbol.
 *
 * It initialises the flag to **true in its constructor**, and its `attributeChangedCallback`
 * renders whenever the flag is set — so for any element carrying an attribute (every real
 * `<sahaj-atlas>` carries `api-key`) the React root is mounted during attribute upgrade,
 * BEFORE `connectedCallback` runs at all. A one-per-page rule enforced in
 * `connectedCallback` would therefore refuse an element that had already mounted, and say
 * so in a message that wasn't true.
 *
 * Resetting it to false in our constructor — base-class field initialisers run inside
 * `super()`, so ours lands second — makes the element behave the way its lifecycle reads:
 * attributes are still recorded on the way in, but nothing renders until
 * `connectedCallback` has had its say. Verified against `@r2wc/core@1.2.0` with a fake
 * renderer: the owner mounts once, at connection, with its `api-key` intact, and a refused
 * element never mounts at all.
 */
const R2WC_CONNECTED = Symbol.for('r2wc.connected')

const AtlasElementBase = r2wc(Widget, {
  props: {
    apiKey: 'string',
    locale: 'string',
    map: 'string',
    analytics: 'string',
    geolocation: 'string',
    basePath: 'string',
    primaryColor: 'string',
    secondaryColor: 'string',
  },
}) as new () => AtlasElement

// Which element owns the page. A widget owns page-global singletons — the API key
// (`config/api/auth`), and BrandTheme's theme root + system-theme watcher, whose own
// comment has long admitted "a second concurrent embed would share these singletons" — so
// a second <sahaj-atlas> used to run on instance A's key and steal its theme root, in
// silence. Exactly one runs now, and the rule is enforced where the thing being counted
// actually lives: the element, not a React render pass. A refused element never mounts a
// React root at all, so it cannot reach the key, the fragment or the theme.
let owner: AtlasElement | null = null

class SahajAtlasElement extends AtlasElementBase {
  constructor() {
    super()
    ;(this as unknown as Record<symbol, boolean>)[R2WC_CONNECTED] = false
  }

  connectedCallback() {
    if (owner && owner !== this && owner.isConnected) {
      reportIntegrationWarning(
        `only one <${ELEMENT_NAME}> runs per page — this one will not render.`,
      )

      return
    }

    owner = this
    super.connectedCallback()
  }

  disconnectedCallback() {
    // Release on the way out, so an embed torn down and re-added (a page builder
    // re-rendering its canvas) isn't locked out by its own ghost. A duplicate that was
    // refused while this one lived stays refused — it gets no second connectedCallback.
    //
    // The API key goes with it. It's a module singleton claimed under `if (!apiKey)`, so
    // without this an element re-added with a DIFFERENT `api-key` would keep
    // authenticating as the first one — the element gate makes concurrent misuse
    // impossible, not sequential.
    if (owner === this) {
      owner = null
      atlasAuth.apiKey = null
    }

    super.disconnectedCallback()
  }
}

// Guarded: `customElements.define` throws NotSupportedError on a name that is already
// registered, and two copies of the embed script on one page is a plausible mistake —
// the docs name two different bundle URLs. The second copy is a no-op with a note to
// the console, not an exception in the host's.
if (customElements.get(ELEMENT_NAME)) {
  reportIntegrationWarning(
    `<${ELEMENT_NAME}> is already defined — the embed script is on this page twice.`,
  )
} else {
  customElements.define(ELEMENT_NAME, SahajAtlasElement)
}
