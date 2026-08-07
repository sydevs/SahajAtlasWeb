import type { MountRoute } from './lib/shape'

import r2wc from '@r2wc/react-to-web-component'
import { HashRouter, MemoryRouter } from 'react-router'
import { useRef } from 'react'

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

export default function Widget({
  apiKey,
  locale,
  map,
  basePath,
  primaryColor,
  secondaryColor,
}: WidgetProps) {
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

customElements.define(
  'sahaj-atlas',
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
