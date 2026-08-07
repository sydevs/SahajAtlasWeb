import type { PaletteRoles } from '@/config/theme/palette'

import { type RefObject, Suspense, lazy, useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Helmet } from 'react-helmet-async'
import * as Fathom from 'fathom-client'
import { useSuspenseQuery } from '@tanstack/react-query'
import { ErrorBoundary } from 'react-error-boundary'
import { MapProvider } from 'react-map-gl'

import { useLocale } from './hooks/use-locale'
import Providers from './providers'
import api, { clientQuery } from './config/api'
import { BrandTheme } from './config/theme/BrandTheme'

import { safePath } from '@/lib/shape'
import { atlasError, reportInternalError } from '@/lib/report'
import { ErrorFallback, LoadingFallback, ResetErrorBoundary } from '@/components/molecules'
import { Mapbox, ReportIssueModal } from '@/components/organisms'
import { DrawerStack } from '@/views'
import { WidgetModeContext } from '@/config/mode'
import preview from '@/config/preview'
import { NoopMapControllerProvider, RealMapControllerProvider } from '@/hooks/use-map-controller'
import '@/styles/globals.css'
import '@/config/i18n'
import i18n from '@/config/i18n'

// Preview mode is admin-only and lazy-loaded, so `@payloadcms/live-preview-react` and
// the controller land in their own chunk — zero cost to normal standalone/embedded use.
const PreviewController = lazy(() =>
  import('@/components/preview/PreviewController').then((m) => ({ default: m.PreviewController })),
)

// ===== APP ===== //

/**
 * The last rung: what renders when the failure is one of the things every other fallback
 * is built on top of (issue #92).
 *
 * `ErrorFallback` is a rich, localized, themed screen — and it sits INSIDE `Providers`
 * and `BrandTheme`, so a throw from either of those (or from the query client, or the
 * i18n boot) unmounted the whole widget with nothing on screen and nothing reported. It
 * doesn't take the host page down, which is why this went unnoticed; it just leaves a
 * hole in their layout.
 *
 * So this rung depends on none of them: no `t()`, no theme tokens, no Tailwind class that
 * a CSS-injection failure could have taken with it, no query client. Inline styles that
 * set only spacing and size, inheriting the host's own colour and font, so it stays
 * legible whatever page it lands in. Untranslated English is the price of a fallback that
 * cannot itself fail — a translated one would have to read the thing that just broke.
 */
const ROOT_FALLBACK_STYLE = {
  padding: '1.5rem',
  fontSize: '0.875rem',
  lineHeight: 1.5,
  textAlign: 'center',
} as const

function RootFallback() {
  return (
    <div role="alert" style={ROOT_FALLBACK_STYLE}>
      Sahaj Atlas could not be loaded. Please reload the page.
    </div>
  )
}

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
}

export default function App({
  apiKey,
  defaultLocale,
  brand,
  themeRootRef,
  standalone = false,
  hasMap = true,
}: AppProps) {
  // Warm the agnostic map/hierarchy caches (feed + region tree) + current-locale titles
  // the moment we have the API key, in parallel with the client bootstrap the tree
  // suspends on — so region/map data isn't serialized behind clients/me. Fire-and-forget
  // and idempotent (React Query dedupes); AppShell still performs the real reads.
  useEffect(() => {
    if (apiKey) api.warmCaches()
  }, [apiKey])

  return (
    <ErrorBoundary
      FallbackComponent={RootFallback}
      onError={(error) => reportInternalError(error, 'widget root')}
    >
      <Providers>
        <BrandTheme apiKey={apiKey} palette={brand} rootRef={themeRootRef}>
          <Suspense fallback={<LoadingFallback />}>
            <ResetErrorBoundary FallbackComponent={ErrorFallback}>
              <AppShell
                apiKey={apiKey}
                defaultLocale={defaultLocale}
                hasMap={hasMap}
                standalone={standalone}
              />
            </ResetErrorBoundary>
          </Suspense>
          {/* Mounted OUTSIDE the app boundary, so "Report an issue" still opens while
            ErrorFallback is on screen — which is exactly when a viewer most wants it.
            That placement means nothing above would catch a throw from here, so it gets
            its own boundary: unbounded, a render error would unmount the whole widget on
            the host page — the reporting affordance taking down the app it reports on.
            Failing to nothing is right, since it's off screen until asked for.

            Not lazy-loaded: it renders at mount (to stay reachable from the error
            fallbacks), so a chunk would be fetched immediately anyway, and its deps —
            react-hook-form, zod — are already in the eager graph via the registration
            form. Splitting it measured 0.6 kB gz LARGER across the first paint, for four
            extra requests. */}
          <ErrorBoundary fallbackRender={() => null}>
            <ReportIssueModal apiKey={apiKey} />
          </ErrorBoundary>
        </BrandTheme>
      </Providers>
    </ErrorBoundary>
  )
}

// ===== APP SHELL ===== //

type AppShellProps = {
  apiKey: string | undefined | null
  defaultLocale?: string | null
  standalone: boolean
  hasMap: boolean
}

function AppShell({ apiKey, defaultLocale, standalone, hasMap }: AppShellProps) {
  if (!apiKey) throw atlasError('config', 'Missing api key.')

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
    <WidgetModeContext.Provider value={{ standalone, hasMap }}>
      {/* Standalone only. Embedded, this <head> is the HOST page's: their og:locale
          describes their document, not the widget inside it, and the widget's hash URLs
          were never canonical anyway (hence `standalone` existing at all). */}
      {standalone && (
        <Helmet>
          <meta content={locale} property="og:locale" />
        </Helmet>
      )}
      {preview.active && (
        <Suspense fallback={null}>
          <PreviewController />
        </Suspense>
      )}
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
