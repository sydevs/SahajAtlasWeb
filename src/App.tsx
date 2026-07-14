import type { PaletteRoles } from '@/config/theme/palette'

import { type RefObject, Suspense, useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Helmet } from 'react-helmet-async'
import * as Fathom from 'fathom-client'
import { useSuspenseQuery } from '@tanstack/react-query'
import { ErrorBoundary } from 'react-error-boundary'
import { MapProvider } from 'react-map-gl'

import { useLocale } from './hooks/use-locale'
import Providers from './providers'
import { clientQuery } from './config/api'
import { BrandTheme } from './config/theme/BrandTheme'

import { safePath } from '@/lib/shape'
import { ErrorFallback, LoadingFallback } from '@/components/molecules'
import { Mapbox } from '@/components/organisms'
import { DrawerStack } from '@/views'
import { WidgetModeContext } from '@/config/mode'
import { NoopMapControllerProvider, RealMapControllerProvider } from '@/hooks/use-map-controller'
import '@/styles/globals.css'
import '@/config/i18n'
import i18n from '@/config/i18n'

// ===== APP ===== //

type AppProps = {
  apiKey: string | undefined | null
  defaultLocale?: string | null
  // Per-embed brand palette. Theming itself is app-wide (standalone also paints
  // the client's colors onto <html>); only `themeRootRef` — the widget wrapper
  // to scope the vars + theme class to — is widget-specific.
  brand?: PaletteRoles
  themeRootRef?: RefObject<HTMLElement | null>
  // Standalone SPA build (BrowserRouter) — advertises canonical/og:url. The
  // embedded <sahaj-atlas> element passes false (its hash URLs aren't canonical).
  standalone?: boolean
  // Render the Mapbox canvas (default true). map=false omits the whole map subtree.
  hasMap?: boolean
  // SahajCloud live-preview mode (default false). Set only by the /preview boot
  // (main.tsx); lazy-mounts <PreviewController> and inerts navigation — zero cost
  // to normal standalone/embedded use.
  preview?: boolean
}

export default function App({
  apiKey,
  defaultLocale,
  brand,
  themeRootRef,
  standalone = false,
  hasMap = true,
  preview = false,
}: AppProps) {
  return (
    <Providers>
      <BrandTheme apiKey={apiKey} palette={brand} rootRef={themeRootRef}>
        <Suspense fallback={<LoadingFallback />}>
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <AppShell
              apiKey={apiKey}
              defaultLocale={defaultLocale}
              hasMap={hasMap}
              preview={preview}
              standalone={standalone}
            />
          </ErrorBoundary>
        </Suspense>
      </BrandTheme>
    </Providers>
  )
}

// ===== APP SHELL ===== //

type AppShellProps = {
  apiKey: string | undefined | null
  defaultLocale?: string | null
  standalone: boolean
  hasMap: boolean
  preview: boolean
}

function AppShell({ apiKey, defaultLocale, standalone, hasMap, preview }: AppShellProps) {
  if (!apiKey) throw new Error('Missing api key.')

  const { data: client } = useSuspenseQuery(clientQuery(apiKey))
  const navigate = useNavigate()
  const location = useLocation()
  const { locale } = useLocale()

  // The configured home region opens as a RegionView over CountriesView on first load;
  // Back returns to the global list. Runs once — re-visiting `/` shows the list,
  // not a redirect loop.
  const homePath =
    (client.region && typeof client.region === 'object' && safePath(client.region.webPath)) ||
    undefined
  const didInit = useRef(false)

  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    if (location.pathname === '/' && homePath && homePath !== '/') navigate(homePath)
  }, [homePath, location.pathname, navigate])

  useEffect(() => {
    if (defaultLocale || client.locale) {
      i18n.changeLanguage(defaultLocale || client.locale || 'en')
    }
  }, [defaultLocale, client.locale])

  // Analytics: one pageview per real navigation. Dedupe repeats so a `replace` or a
  // map-click landing on the same URL isn't double-counted.
  const primaryDomain = useMemo(
    () =>
      client.allowedDomains
        ?.split('\n')
        .map((domain) => domain.trim())
        .find(Boolean) ?? '',
    [client.allowedDomains],
  )
  const fathomEnabled =
    !!import.meta.env.VITE_FATHOM_ID && !!primaryDomain && !primaryDomain.includes('localhost')
  const lastTracked = useRef('')

  useEffect(() => {
    if (fathomEnabled) Fathom.load(import.meta.env.VITE_FATHOM_ID)
  }, [fathomEnabled])

  useEffect(() => {
    if (!fathomEnabled || lastTracked.current === location.pathname) return
    lastTracked.current = location.pathname
    Fathom.trackPageview({ url: `https://${primaryDomain}${location.pathname}` })
  }, [location.pathname, fathomEnabled, primaryDomain])

  return (
    <WidgetModeContext.Provider value={{ standalone, hasMap, preview }}>
      <Helmet>
        <meta content={locale} property="og:locale" />
      </Helmet>
      {hasMap ? (
        <MapProvider>
          {/* Inline fixed/inset so the map always fills the viewport behind the
              drawers — independent of Tailwind viewport-unit utility generation. */}
          <div style={{ position: 'fixed', inset: 0 }}>
            <Mapbox />
          </div>
          <RealMapControllerProvider>
            <DrawerStack />
          </RealMapControllerProvider>
        </MapProvider>
      ) : (
        <NoopMapControllerProvider>
          <DrawerStack />
        </NoopMapControllerProvider>
      )}
    </WidgetModeContext.Provider>
  )
}
