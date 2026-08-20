import type { PaletteRoles } from '@/config/theme/palette'
import type { RoutingMode } from '@/loader/config'
import type { CompactState } from '@/lib/slot-decision'

import { type ReactNode, type RefObject, Suspense, lazy, useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router'
import { Helmet } from 'react-helmet-async'
import * as Fathom from 'fathom-client'
import { useSuspenseQuery } from '@tanstack/react-query'
import { ErrorBoundary } from 'react-error-boundary'

import { useLocale } from './hooks/use-locale'
import Providers from './providers'
import api, { clientQuery } from './config/api'
import { BrandTheme } from './config/theme/BrandTheme'

import { safePath } from '@/lib/shape'
import { atlasError, reportInternalError } from '@/lib/report'
import { clearReadiness } from '@/lib/readiness'
import { announceEmbed } from '@/lib/embed-announce'
import embed from '@/config/embed'
import { ErrorFallback, LoadingFallback, ResetErrorBoundary } from '@/components/molecules'
// ⚠ The component's own path, NOT the `@/components/organisms` barrel. The barrel re-exports
// `Mapbox`, so importing ANYTHING through it pulls `react-map-gl` — whose `exports-mapbox.js`
// fires `import('mapbox-gl')` at module scope — straight back into the eager graph. Splitting
// `FullInterface` behind `lazy` was not enough on its own: measured in a browser, the compact
// embed still fetched all 485 KiB gz through this one barrel import.
import { ReportIssueModal } from '@/components/organisms/ReportIssueForm'
import { NoExpansionProvider } from '@/hooks/use-expansion'
import { CompactEmbedView } from '@/views/CompactEmbedView'
import { WidgetModeContext } from '@/config/mode'
import preview from '@/config/preview'
import '@/styles/globals.css'
// Registers the self-hosted Raleway faces (#91). A side-effect import beside the
// stylesheet because that is what it is — the part of our CSS that a `url()` in an
// injected stylesheet cannot express. See src/styles/fonts.ts.
import '@/styles/fonts'
import '@/config/i18n'
import i18n from '@/config/i18n'

// Preview mode is admin-only and lazy-loaded, so `@payloadcms/live-preview-react` and
// the controller land in their own chunk — zero cost to normal standalone/embedded use.
// Lazy on purpose — see the module's own docblock. This is the boundary that keeps
// `react-map-gl` (and therefore mapbox-gl) out of a compact embed's payload.
const FullInterface = lazy(() => import('@/views/FullInterface'))

const PreviewController = lazy(() =>
  import('@/components/preview/PreviewController').then((m) => ({ default: m.PreviewController })),
)

// ===== APP ===== //

/**
 * The last rung: what renders when the failure is one of the things every other fallback
 * is built on top of (issue #92).
 *
 * `ErrorFallback` is a rich, localized, themed screen — and it sits INSIDE `Providers` and
 * `BrandTheme`, so a throw from either of those (or from the query client, or the i18n
 * boot) unmounted the whole widget with nothing on screen and nothing reported. It doesn't
 * take the host page down, which is why this went unnoticed; it just leaves a hole in
 * their layout.
 *
 * So this rung depends on none of them: no `t()`, no theme tokens, no Tailwind class that
 * a CSS-injection failure could have taken with it, no query client — which is also why it
 * lives here rather than in `components/molecules/Fallbacks` beside its two richer
 * siblings. Inline styles set only spacing and size, inheriting the host's own colour and
 * font, so it stays legible on whatever page it lands in. Untranslated English is the
 * price of a fallback that cannot itself fail: a translated one would have to read the
 * thing that just broke.
 */
function RootFallback() {
  return (
    <div role="alert" style={{ padding: '1.5rem', fontSize: '0.875rem', textAlign: 'center' }}>
      This content could not be loaded. Please reload the page.
    </div>
  )
}

/**
 * The boundary that renders it. Exported because the widget entry mounts a SECOND one
 * outside the router (`Widget.tsx`): this one covers `Providers`/`BrandTheme` and the app
 * — including the standalone entry, which is why it stays here — while the entry's copy
 * additionally covers the router, the theme wrapper and the mount decision itself, none of
 * which anything below could catch.
 */
export function RootBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      FallbackComponent={RootFallback}
      onError={(error) => {
        reportInternalError(error, 'widget root')
        // The readiness marker attests a WORKING embed, and this rung means there isn't one
        // (#153). Left up, SahajCloud's verifier would load this page, find the attestation
        // beside a static "could not be loaded" panel, and adopt it as a region's canonical URL.
        // A no-op when nothing published — the standalone entry and every Ladle story.
        clearReadiness()
      }}
    >
      {children}
    </ErrorBoundary>
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
  /**
   * Render the compact card instead of the interface, and everything that decision carried
   * with it — decided once at mount by the entry that can measure the slot (#161).
   *
   * `null`/absent is the full interface, and is the only answer the standalone build gives
   * when it is not framed. One nullable object rather than a flag plus its satellites, so a
   * caller cannot pass an auto-open that nothing reads.
   */
  compact?: CompactState | null
  // Is the route on screen in the URL, and therefore shareable? True for both routers
  // that write one (BrowserRouter standalone, the query router embedded); the embedded widget
  // passes false when it mounted a MemoryRouter over a host anchor it declined to take.
  // Defaults true — see config/mode.ts.
  linkable?: boolean
  // The URL shape the router actually uses, from `mountDecision` — what the readiness marker
  // attests (#153), as opposed to the `routing` parameter a host asked for. Only the embedded
  // entry has a real answer; the standalone build publishes no marker at all (nothing observed
  // it), so its default is never read.
  routing?: RoutingMode
}

export default function App({
  apiKey,
  defaultLocale,
  brand,
  themeRootRef,
  standalone = false,
  hasMap = true,
  compact = null,
  linkable = true,
  routing = 'query',
}: AppProps) {
  // Warm the agnostic map/hierarchy caches (feed + region tree) + current-locale titles
  // the moment we have the API key, in parallel with the client bootstrap the tree
  // suspends on — so region/map data isn't serialized behind clients/me. Fire-and-forget
  // and idempotent (React Query dedupes); AppShell still performs the real reads.
  //
  // ⚠ **Not while a compact card is all that renders.** The feed and the region tree exist to
  // serve the interface, and a collapsed card shows neither — so warming them turns every page
  // view of a sidebar embed nobody presses into two reads of the whole dataset. That is the
  // exact cost #161 removed by deleting the card's preview rows, and it came straight back in
  // through here: `CompactEmbedView.test.tsx` asserts the ROWS are absent, which a fetch two
  // components above it satisfies while still making the requests. Found in a browser, because
  // no unit spec can see a request the component under test never issues.
  //
  // `FullInterface` warms on mount instead, so pressing the button still warms them. It stays
  // here for the full form because there the point is the PARALLELISM — moving it behind a lazy
  // chunk would put the feed back behind a round trip it currently overlaps.
  useEffect(() => {
    if (apiKey && !compact) api.warmCaches()
  }, [apiKey, compact])

  return (
    <RootBoundary>
      <Providers>
        <BrandTheme apiKey={apiKey} palette={brand} rootRef={themeRootRef}>
          <Suspense fallback={<LoadingFallback />}>
            {/* `context` names this one in a report: everything below is a drawer failing
                to load, this is the widget failing to boot. Which is also why it, and the root
                boundary above, are the only two that take the readiness marker down (#153):
                a drawer that failed is a widget that still works, and over-clearing costs a
                verification failure against SahajCloud's three-strike budget. */}
            <ResetErrorBoundary
              FallbackComponent={ErrorFallback}
              context="app"
              onError={clearReadiness}
            >
              <AppShell
                apiKey={apiKey}
                compact={compact}
                defaultLocale={defaultLocale}
                hasMap={hasMap}
                linkable={linkable}
                routing={routing}
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
          <ErrorBoundary
            fallbackRender={() => null}
            // Failing to nothing is right on screen, but it must not also fail to nothing
            // in the log: this is the one boundary whose fallback leaves NO trace a viewer
            // could report, so the seam is the only way anyone learns the reporting
            // affordance is the thing that broke (issue #108).
            onError={(error) => reportInternalError(error, 'report modal')}
          >
            <ReportIssueModal apiKey={apiKey} />
          </ErrorBoundary>
        </BrandTheme>
      </Providers>
    </RootBoundary>
  )
}

// ===== APP SHELL ===== //

type AppShellProps = {
  apiKey: string | undefined | null
  defaultLocale?: string | null
  standalone: boolean
  hasMap: boolean
  compact: CompactState | null
  linkable: boolean
  routing: RoutingMode
}

function AppShell({
  apiKey,
  defaultLocale,
  standalone,
  hasMap,
  compact,
  linkable,
  routing,
}: AppShellProps) {
  if (!apiKey) throw atlasError('config', 'Missing api key.')

  const { data: client } = useSuspenseQuery(clientQuery(apiKey))
  const location = useLocation()
  const { locale } = useLocale()

  // The configured home region. The redirect that consumes it lives in `FullInterface`, which
  // renders only once the interface is on screen — see the note there.
  const homePath =
    (client.region && typeof client.region === 'object' && safePath(client.region.webPath)) ||
    undefined

  /**
   * Attest that the widget booted, and tell SahajCloud what it found (#153).
   *
   * **It lives HERE, below the app error boundary, and that placement is the whole guarantee.**
   * The obvious home is the widget's own root — but `componentDidCatch` runs in the commit's
   * layout phase and a parent's `useEffect` in the passive phase *after* it, so a synchronous
   * first-render failure (a loader URL with no `key` throws four lines up) would let the boundary
   * clear a marker that had not been published yet, and the root's effect would then publish one
   * over the "could not be loaded" screen, permanently. Reached from here, three things are true
   * at once and none of them by luck: the marker cannot precede a successful boot, because
   * `useSuspenseQuery` above has resolved the client record — the widget demonstrably reached the
   * API; it is never published over the loading state, because this component does not exist
   * during it; and pressing "Try again" remounts this component, which re-publishes a marker the
   * boundary took down.
   */
  useEffect(() => {
    void announceEmbed({ routing, observed: embed.observed })
  }, [routing])

  useEffect(() => {
    if (defaultLocale || client.locale) {
      i18n.changeLanguage(defaultLocale || client.locale || 'en')
    }
  }, [defaultLocale, client.locale])

  // Analytics: one pageview per real navigation. Dedupe repeats so a `replace` or a
  // map-click landing on the same URL isn't double-counted.
  //
  // Fathom injects OUR tracker script into the HOST's page, so the host gets the last
  // word: `analytics="false"` on <sahaj-atlas> keeps it out entirely (issue #95).
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
  // Whether the tracker on this page is OURS. `Fathom.load` returns early if
  // `window.fathom` already exists, so on a host that runs its own Fathom we would
  // otherwise write our routes into THEIR site — and the guarantees below are
  // properties of our script tag, not theirs.
  const ownsTracker = useRef(false)

  useEffect(() => {
    if (!fathomEnabled || 'fathom' in window) return

    ownsTracker.current = true
    // `auto: false` matters more than it looks: left on (the default), Fathom's script
    // records the page it lands on — the HOST's real URL, query string and all, which
    // may carry a reset token or an OAuth param and is not ours to send anywhere. The
    // effect below reports the widget's own route under the client's primary domain
    // instead, which is the only thing this analytics is for. `honorDNT` because a
    // visitor who set the header has already answered the question.
    Fathom.load(import.meta.env.VITE_FATHOM_ID, { auto: false, honorDNT: true })
  }, [fathomEnabled])

  useEffect(() => {
    if (!fathomEnabled || !ownsTracker.current || lastTracked.current === location.pathname) return
    lastTracked.current = location.pathname
    Fathom.trackPageview({ url: `https://${primaryDomain}${location.pathname}` })
  }, [location.pathname, fathomEnabled, primaryDomain])

  // Built as an ELEMENT, not rendered here: in the compact form it is handed to the surface,
  // and React never renders it until that opens — which is what keeps mapbox-gl unfetched.
  // Its own Suspense, so the boundary travels WITH the element: in the compact form this
  // renders inside the dialog, and suspending to `AppShell`'s boundary would replace the card
  // with a loading panel instead of showing one where the interface is about to appear.
  const interfaceElement = (
    <Suspense fallback={<LoadingFallback />}>
      <FullInterface hasMap={hasMap} homePath={homePath} />
    </Suspense>
  )

  return (
    <WidgetModeContext.Provider value={{ standalone, hasMap, linkable }}>
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
      {compact ? (
        <CompactEmbedView compact={compact}>{interfaceElement}</CompactEmbedView>
      ) : (
        <NoExpansionProvider>{interfaceElement}</NoExpansionProvider>
      )}
    </WidgetModeContext.Provider>
  )
}

// ===== THE COMPACT FORM ===== //
