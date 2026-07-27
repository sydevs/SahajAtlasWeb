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
import { ErrorFallback, LoadingFallback } from '@/components/molecules'
import { Mapbox } from '@/components/organisms'
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

// The report-issue modal is reached only from the settings menu or an error CTA, and it
// pulls in react-hook-form + zod, so it gets its own chunk rather than riding on every
// embed's first load. Imported by path, not the organisms barrel, so the barrel's other
// consumers don't drag it back into the main graph.
const ReportIssueModal = lazy(() =>
  import('@/components/organisms/ReportIssueForm/ReportIssueModal').then((m) => ({
    default: m.ReportIssueModal,
  })),
)

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
    <Providers>
      <BrandTheme apiKey={apiKey} palette={brand} rootRef={themeRootRef}>
        <Suspense fallback={<LoadingFallback />}>
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <AppShell
              apiKey={apiKey}
              defaultLocale={defaultLocale}
              hasMap={hasMap}
              standalone={standalone}
            />
          </ErrorBoundary>
        </Suspense>
        {/* Mounted OUTSIDE the app boundary, so "Report an issue" still opens while
            ErrorFallback is on screen — which is exactly when a viewer most wants it —
            with its own Suspense fence so the lazy chunk can't suspend the app's.
            Lazy because it carries react-hook-form + the form, which most viewers never
            open; that costs nothing in the failures it exists for, since the Turnstile
            script and the eventual POST (#80) already need the network anyway. */}
        {/* Its own boundary, because this one sits OUTSIDE the app's: Suspense catches
            suspension, not errors, and a lazy chunk that 404s (a host page holding a
            cached entry chunk across a redeploy) rejects during render. Unbounded, that
            would unmount the whole widget on the host page — the reporting affordance
            taking down the app it exists to report on. Failing to nothing is right here:
            the modal is never on screen until asked for. */}
        <ErrorBoundary fallbackRender={() => null}>
          <Suspense fallback={null}>
            <ReportIssueModal apiKey={apiKey} />
          </Suspense>
        </ErrorBoundary>
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
}

function AppShell({ apiKey, defaultLocale, standalone, hasMap }: AppShellProps) {
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
    <WidgetModeContext.Provider value={{ standalone, hasMap }}>
      <Helmet>
        <meta content={locale} property="og:locale" />
      </Helmet>
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
