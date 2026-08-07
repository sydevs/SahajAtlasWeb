import type { MountRoute } from './lib/shape'

import r2wc from '@r2wc/react-to-web-component'
import { HashRouter, MemoryRouter } from 'react-router'
import { useEffect, useRef } from 'react'

import App from './App'
import atlasAuth from './config/api/auth'
import i18n from './config/i18n'
import { useLocale } from './hooks/use-locale'
import { getInitialTheme } from './hooks/use-theme'
import { HASH_BASE, mountRoute } from './lib/shape'
import { reportInternalError } from './lib/report'

// Implementation of embeddable Widget
// Demo in: demo.html
// Based on: https://www.linkedin.com/pulse/converting-react-app-appendable-widget-using-web-mike-rahimi-wssnf/

const ELEMENT_NAME = 'sahaj-atlas'

/**
 * Say something to whoever integrated the widget, without trusting the host page's
 * console. A host may have replaced or removed `console.warn`, and a throw from here
 * would take down the very mount path being warned about — the same reasoning as
 * `reportInternalError` (`lib/report.ts`).
 */
function warnHost(message: string): void {
  try {
    console.warn(`[${ELEMENT_NAME}] ${message}`)
  } catch {
    // Nothing left to do — a logger that throws is not worth a second attempt.
  }
}

// Which instance owns the page. A widget owns page-global singletons — the API key
// (`config/api/auth`), and BrandTheme's theme root + system-theme watcher — and a second
// concurrent <sahaj-atlas> used to share them silently: running on instance A's key and
// stealing its theme root out from under it. Exactly one instance runs now.
let owner: symbol | null = null

/**
 * Claim the page for this instance, once. `false` for a second concurrent element, which
 * renders nothing and says why in the console: a host misconfiguration belongs where the
 * integrator will see it, not as untranslated developer text injected into a public page.
 *
 * The claim is frozen in a ref rather than re-read per render, so a later re-render (an
 * attribute change) can never flip a duplicate into the owner — which would change how
 * many hooks that instance calls.
 */
function useSoleInstance(): boolean {
  const instance = useRef<symbol>()
  const isOwner = useRef<boolean>()

  if (isOwner.current === undefined) {
    instance.current = Symbol(ELEMENT_NAME)
    owner ??= instance.current
    isOwner.current = owner === instance.current
  }

  useEffect(() => {
    if (!isOwner.current) {
      warnHost(`only one <${ELEMENT_NAME}> runs per page — this one will not render.`)

      return
    }

    // Release the page on unmount, so an embed torn down and re-added (a page builder
    // re-rendering its canvas) isn't locked out by its own ghost.
    return () => {
      if (owner === instance.current) owner = null
    }
  }, [])

  return isOwner.current
}

type WidgetProps = {
  apiKey: string
  locale?: string
  basePath?: string
  // Render the map canvas? Default true; `map="false"` (or "0") renders content-
  // only (no Mapbox, no token needed) — the mode-agnostic <sahaj-atlas> element.
  map?: string
  // Per-embed brand palette (hex). Each role overrides the client record's
  // color; omitted roles fall back to the record, then the built-in default.
  // (No `backgroundColor`: the page surface is a fixed default now.)
  primaryColor?: string
  secondaryColor?: string
}

/**
 * Act on the mount decision (`mountRoute`, `lib/shape/hash.ts`): take the URL fragment
 * when it's free, and say so if the host won't let us.
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
    window.history.replaceState(window.history.state, '', route.write)

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
 * The custom element's React root, and the only place the one-per-page rule is decided.
 * Everything a widget does to the page — claiming the API key, the URL fragment, the
 * theme root — happens below this line in <Atlas>, so a duplicate touches none of it.
 */
export default function Widget(props: WidgetProps) {
  const isSole = useSoleInstance()

  return isSole ? <Atlas {...props} /> : null
}

function Atlas({ apiKey, locale, map, basePath, primaryColor, secondaryColor }: WidgetProps) {
  if (!atlasAuth.apiKey) {
    atlasAuth.apiKey = apiKey
  }

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
  // arriving at `#respond` used to render a BLANK widget, because react-router reads
  // that as a location outside the `!` basename. The widget now routes off-URL there
  // instead of overwriting an anchor that is not its to take — so the host's on-load
  // scroll, and anything of theirs that reads `location.hash` later, keep working.
  const mount = useRef<MountRoute>()

  if (!mount.current) {
    mount.current = claimFragment(mountRoute(window.location.hash, basePath))
  }

  const hasMap = map !== 'false' && map !== '0'

  // The widget scopes its theme to this wrapper so it never mutates the host
  // page's <html>. Set the initial light/dark class synchronously to avoid a
  // flash; BrandTheme adopts the wrapper as the theme root + paints the brand
  // palette once mounted. `dir` derives from the ACTIVE locale (reactively) so
  // every descendant — and Tailwind's rtl: variants — follow text direction.
  const themeRootRef = useRef<HTMLDivElement>(null)
  const { locale: activeLocale } = useLocale()

  const atlas = (
    /* display:contents keeps the wrapper out of the layout while still
       carrying the theme class + brand CSS vars down to every descendant. */
    <div
      ref={themeRootRef}
      className={getInitialTheme()}
      dir={i18n.dir(activeLocale)}
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

// Guarded: `customElements.define` throws NotSupportedError on a name that is already
// registered, and two copies of the embed script on one page is a plausible mistake —
// the docs name two different bundle URLs. The second copy is a no-op with a note to
// the console, not an exception in the host's.
if (customElements.get(ELEMENT_NAME)) {
  warnHost(`<${ELEMENT_NAME}> is already defined — the embed script is on this page twice.`)
} else {
  customElements.define(
    ELEMENT_NAME,
    r2wc(Widget, {
      props: {
        apiKey: 'string',
        locale: 'string',
        map: 'string',
        basePath: 'string',
        primaryColor: 'string',
        secondaryColor: 'string',
      },
    }),
  )
}
