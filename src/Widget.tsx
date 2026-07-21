import r2wc from '@r2wc/react-to-web-component'
import { HashRouter } from 'react-router'
import { useRef } from 'react'

import App from './App'
import atlasAuth from './config/api/auth'
import { installChunkRecovery } from './config/chunk-recovery'
import i18n from './config/i18n'
import { useLocale } from './hooks/use-locale'
import { getInitialTheme } from './hooks/use-theme'
import { safePath } from './lib/shape'

// Implementation of embeddable Widget
// Demo in: demo.html
// Based on: https://www.linkedin.com/pulse/converting-react-app-appendable-widget-using-web-mike-rahimi-wssnf/

// embed.js keeps a stable URL but its lazy chunks are hashed per deployment —
// reload once if one vanishes mid-session (a deploy happened underneath us).
installChunkRecovery()

const HASH_BASE = '!'

type WidgetProps = {
  apiKey: string
  locale?: string
  basePath?: string
  // Render the map canvas? Default true; `map="false"` (or "0") renders content-
  // only (no Mapbox, no token needed) — the mode-agnostic <sahaj-atlas> element.
  map?: string
  // Per-embed brand palette (hex). Each role overrides the client record's
  // color; omitted roles fall back to the record, then the built-in default.
  primaryColor?: string
  secondaryColor?: string
  backgroundColor?: string
}

export default function Widget({
  apiKey,
  locale,
  map,
  basePath,
  primaryColor,
  secondaryColor,
  backgroundColor,
}: WidgetProps) {
  if (!atlasAuth.apiKey) {
    atlasAuth.apiKey = apiKey
  }

  // NB: the initial locale is applied by App's AppShell effect (from `defaultLocale`
  // below), which runs once on mount and again only if the host changes the prop.
  // Don't call i18n.changeLanguage here in the render body — it re-fired on every
  // render and clobbered a language the user picked from the settings menu.

  // Boot on the host-declared initial route (e.g. an event or register path for
  // an embedded form — issue #52 WS7) when the hash carries no route yet; a
  // hash the visitor already navigated always wins. `safePath` rejects anything
  // but a site-relative path. Guarded to the FIRST render: the root hash
  // (`#!/`) recurs whenever the visitor navigates back home, and Widget
  // re-renders reactively (locale changes) — re-running this would teleport
  // them back to basePath.
  const booted = useRef(false)

  if (!booted.current) {
    booted.current = true
    if (
      !window.location.hash ||
      window.location.hash === `#${HASH_BASE}` ||
      window.location.hash === `#${HASH_BASE}/`
    ) {
      window.location.hash = `${HASH_BASE}${safePath(basePath) ?? ''}`
    }
  }

  const hasMap = map !== 'false' && map !== '0'

  // The widget scopes its theme to this wrapper so it never mutates the host
  // page's <html>. Set the initial light/dark class synchronously to avoid a
  // flash; BrandTheme adopts the wrapper as the theme root + paints the brand
  // palette once mounted. `dir` derives from the ACTIVE locale (reactively) so
  // every descendant — and Tailwind's rtl: variants — follow text direction.
  const themeRootRef = useRef<HTMLDivElement>(null)
  const { locale: activeLocale } = useLocale()

  return (
    <HashRouter basename={HASH_BASE}>
      {/* display:contents keeps the wrapper out of the layout while still
          carrying the theme class + brand CSS vars down to every descendant. */}
      <div
        ref={themeRootRef}
        className={getInitialTheme()}
        dir={i18n.dir(activeLocale)}
        style={{ display: 'contents' }}
      >
        <App
          apiKey={apiKey}
          brand={{ primary: primaryColor, secondary: secondaryColor, background: backgroundColor }}
          defaultLocale={locale}
          hasMap={hasMap}
          themeRootRef={themeRootRef}
        />
      </div>
    </HashRouter>
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
      backgroundColor: 'string',
    },
  }),
)
