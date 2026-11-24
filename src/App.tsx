import type { PaletteRoles } from '@/config/theme/palette'
import type { RoutingMode } from '@/loader/config'

import { type ReactNode, Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Helmet } from 'react-helmet-async'
import { useSuspenseQuery } from '@tanstack/react-query'
import { ErrorBoundary } from 'react-error-boundary'

import { useLocale } from './hooks/use-locale'
import Providers from './providers'
import api, { clientQuery } from './config/api'
import { BrandTheme } from './config/theme/BrandTheme'
import { THEME_COLOR } from './config/theme/theme-color'
import { useTheme } from './hooks/use-theme'

import { homePathFor, pageLocaleOverride, safePath } from '@/lib/shape'
import { atlasError, reportInternalError } from '@/lib/report'
import { clearReadiness } from '@/lib/readiness'
import { announceEmbed } from '@/lib/embed-announce'
import embed from '@/config/embed'
// ⚠ By folder path, NOT the `@/components/molecules` barrel, for the reason below: through the
// barrel these three bring every molecule the interface renders into the eager graph, 30.9 KiB gz.
import {
  ErrorFallback,
  LoadingFallback,
  ResetErrorBoundary,
} from '@/components/molecules/Fallbacks'
// ⚠ Imports the component's own path, NOT the `@/components/organisms` barrel. The barrel
// re-exports `Mapbox`, so importing ANYTHING through it pulls the map and `react-map-gl`
// straight back into the eager graph. Under react-map-gl 7, which fired `import('mapbox-gl')` at
// module scope, splitting `FullInterface` behind `lazy` was not enough on its own: measured in a
// browser, an embed still fetched all 485 KiB gz through this one barrel import.
import { ReportIssueModal } from '@/components/organisms/ReportIssueForm'
import { WidgetModeContext } from '@/config/mode'
import livePreview from '@/config/live-preview/protocol'
import '@/styles/globals.css'
// Registers the self-hosted Raleway faces (#91). This is a side-effect import beside the
// stylesheet, because that is what it is — the part of our CSS a `url()` in an
// injected stylesheet cannot express. See src/styles/fonts.ts.
import '@/styles/fonts'
import '@/config/i18n'
import i18n from '@/config/i18n'
import { applyLocale, bootLocale } from '@/config/locale'
import { useAvailableLocales } from '@/hooks/use-available-locales'

// The boundary that keeps `react-map-gl` (and therefore mapbox-gl) out of the eager graph:
// every interface form is a lazy chunk. Live preview is lazy for its own reason: it is
// admin-only, so the controller lands in a chunk nobody else fetches.
const FullInterface = lazy(() => import('@/views/FullInterface'))
const InlineEmbedView = lazy(() => import('@/views/InlineEmbedView/InlineEmbedView'))

const LivePreviewController = lazy(() =>
  import('@/components/live-preview/LivePreviewController').then((m) => ({
    default: m.LivePreviewController,
  })),
)

// ===== APP ===== //

/**
 * The last rung: what renders when the failure is one of the things every other
 * fallback is built on top of (issue #92).
 *
 * `ErrorFallback` is a rich, localized, themed screen, and it sits INSIDE `Providers`
 * and `BrandTheme`. So a throw from either of those (or from the query client, or the
 * i18n boot) used to unmount the whole widget with nothing on screen and nothing
 * reported. It does not take the host page down, which is why this went unnoticed — it
 * just leaves a hole in their layout.
 *
 * So this rung depends on none of them: no `t()`, no theme tokens, no Tailwind class a
 * CSS-injection failure could have taken with it, no query client — which is also why
 * it lives here, rather than in `components/molecules/Fallbacks` beside its two richer
 * siblings. Inline styles set only spacing and size, inheriting the host's own colour
 * and font, so it stays legible on whatever page it lands on. Untranslated English is
 * the price of a fallback that cannot itself fail: a translated one would have to read
 * the very thing that just broke.
 */
function RootFallback() {
  return (
    <div role="alert" style={{ padding: '24px', fontSize: '14px', textAlign: 'center' }}>
      This content could not be loaded. Please reload the page.
    </div>
  )
}

/**
 * The boundary that renders it. Exported because the widget entry mounts a SECOND one
 * outside the router (`Widget.tsx`): this one covers `Providers`/`BrandTheme` and the
 * app — including the standalone entry, which is why it stays here — while the entry's
 * copy additionally covers the router, the theme wrapper, and the mount decision
 * itself, none of which anything below could catch.
 */
export function RootBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      FallbackComponent={RootFallback}
      onError={(error) => {
        reportInternalError(error, 'widget root')
        // The readiness marker attests a WORKING embed, and this rung means there
        // isn't one (#153). Left up, SahajCloud's verifier would load this page, find
        // the attestation beside a static "could not be loaded" panel, and adopt it
        // as a region's canonical URL. This is a no-op when nothing has published —
        // the standalone entry and every Ladle story.
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
  // the client's colors onto <html>).
  brand?: PaletteRoles
  // Standalone SPA build (BrowserRouter) — advertises canonical/og:url. The
  // embedded <sahaj-atlas> element passes false (the <head> there is the host's).
  standalone?: boolean
  // Render the Mapbox canvas (default true). map=false omits the whole map subtree.
  hasMap?: boolean
  /**
   * The atlas in the host's own page, with the map one button away — every embed and every
   * framed page. `false` is the map-first interface: the standalone page opened directly.
   * Decided once, by the entry — and overruled by `hasMap: false`, which is always inline,
   * since the map-first form has nothing to put first.
   */
  inline?: boolean
  // Is the route on screen in the URL, and therefore shareable? True for every router
  // that writes one (BrowserRouter standalone, the query and path routers embedded). The
  // embedded widget passes false in memory mode, taken where the document refuses `replaceState`.
  // Defaults true — see config/mode.ts.
  linkable?: boolean
  // The URL shape the router actually uses, from `mountDecision` — what the readiness marker
  // attests (#153), as opposed to the `routing` parameter a host asked for. Only the embedded
  // entry has a real answer. The standalone build publishes no marker at all (nothing observed
  // it), so its default is never read.
  routing?: RoutingMode
  /** The path prefix, in `path` routing — what the embed report files as the mount. */
  prefix?: string
}

export default function App({
  apiKey,
  defaultLocale,
  brand,
  standalone = false,
  hasMap = true,
  inline: inlineAsked = false,
  linkable = true,
  routing = 'query',
  prefix,
}: AppProps) {
  const inline = inlineAsked || !hasMap

  // Warms the agnostic map/hierarchy caches (feed plus region tree) and the
  // current-locale titles the moment the API key is available, in parallel with the
  // client bootstrap the tree suspends on — so region/map data is not serialized
  // behind clients/me. This is fire-and-forget and idempotent (React Query dedupes).
  // AppShell still performs the real reads. It stays here, rather than behind the lazy
  // interface chunk, because the point is the PARALLELISM — moving it there would put the
  // feed back behind a round trip it currently overlaps.
  useEffect(() => {
    if (apiKey) api.warmCaches()
  }, [apiKey])

  // The language and the copy are warmed beside `clients/me`, or the widget paints in English
  // and then switches in front of the viewer. That is the boot order PR #168 measured: warmed in
  // parallel, the config settled 1 ms after `clients/me`; serialized behind it, the flip was
  // visible. `PathBoot` in `Widget.tsx` fires the same pair, because in path mode it reads the
  // client record above this component.
  //
  // ⚠ **`bootLocale`, not `i18n.language`.** The detected tag is not what `AppShell` will
  // ask for: the script's `locale=fr` reaches it as `defaultLocale`, which no detector reads, and a
  // browser's `en-US` narrows to `en` in `preferredLocale`. Warming the raw tag in either
  // case fills a key nothing reads, which is the flip this effect exists to prevent, paid for.
  useEffect(() => {
    if (!apiKey) return

    api.warmConfig()
    api.warmTranslations(bootLocale(window.location.search, defaultLocale))
  }, [apiKey, defaultLocale])

  return (
    <RootBoundary>
      <Providers>
        <BrandTheme apiKey={apiKey} palette={brand}>
          {/* `unboxed` is the map form that fills the window: its interface is fixed and
              inset-0, so a fallback standing in for it must be too, or it collapses to its
              own content height at the top of the screen. The inline form has a real box,
              and there `h-full` is already right. */}
          <Suspense fallback={<LoadingFallback unboxed={!inline} />}>
            {/* `context` names this one in a report: everything below is a drawer failing
                to load. This is the widget failing to boot. That is also why it, and the root
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
                defaultLocale={defaultLocale}
                hasMap={hasMap}
                inline={inline}
                linkable={linkable}
                prefix={prefix}
                routing={routing}
                standalone={standalone}
              />
            </ResetErrorBoundary>
            {/* Inside the Suspense boundary, outside the app's ERROR boundary: "Report an issue"
              still opens while ErrorFallback is on screen — which is exactly when a viewer
              most wants it — while a suspending read inside it falls to a boundary instead
              of a hand-written pending branch.
              Nothing above would catch a THROW from here, so it gets
              its own boundary: unbounded, a render error here would unmount the whole
              widget on the host page — the reporting affordance taking down the app it
              reports on. Failing to nothing is right, since it stays off screen until
              asked for.

              Not lazy-loaded: the host renders at mount (to stay reachable from the error
              fallbacks), and the form inside is reached mostly from a failure, where a
              chunk fetched on open is what `use-report-form.ts` reads the form at mount
              to avoid. ⚠ The price is 37.6 KiB gz of eager graph for this form alone —
              react-hook-form and Radix's select, checkbox and switch, measured with the
              form behind `lazy` — since the registration form went lazy (#96). */}
            <ErrorBoundary
              fallbackRender={() => null}
              // Failing to nothing is right on screen, but it must not also fail to
              // nothing in the log: this is the one boundary whose fallback leaves NO
              // trace a viewer could report, so this seam is the only way anyone learns
              // the reporting affordance is the thing that broke (issue #108).
              onError={(error) => reportInternalError(error, 'report modal')}
            >
              <ReportIssueModal apiKey={apiKey} />
            </ErrorBoundary>
          </Suspense>
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
  inline: boolean
  linkable: boolean
  routing: RoutingMode
  prefix?: string
}

function AppShell({
  apiKey,
  defaultLocale,
  standalone,
  hasMap,
  inline,
  linkable,
  routing,
  prefix,
}: AppShellProps) {
  if (!apiKey) throw atlasError('config', 'Missing api key.')

  const { data: client } = useSuspenseQuery(clientQuery(apiKey))
  const { locale, t } = useLocale()
  const { theme } = useTheme()

  // Where the interface goes when it first opens on the root view: a path-mode host's
  // `atlas` default, else the client record's home region (`homePathFor`). The redirect
  // that consumes it is `useInterfaceBoot`'s, in the interface chunk.
  const homePath = homePathFor({
    routing,
    route: embed.config.route,
    routeFromPage: embed.config.routeFromPage,
    region:
      (client.region && typeof client.region === 'object' && safePath(client.region.webPath)) ||
      undefined,
  })

  /**
   * Attests that the widget booted, and tells SahajCloud what it found (#153).
   *
   * **It lives HERE, below the app error boundary, and that placement is the whole
   * guarantee.** The obvious home is the widget's own root — but `componentDidCatch`
   * runs in the commit's layout phase, and a parent's `useEffect` runs in the passive
   * phase *after* it. So a synchronous first-render failure (a loader URL with no
   * `key` throws four lines up) would let the boundary clear a marker that had not
   * been published yet, and the root's effect would then publish one over the "could
   * not be loaded" screen, permanently. Reached from here, three things are true at
   * once, and none of them by luck: the marker cannot precede a successful boot,
   * because `useSuspenseQuery` above has already resolved the client record, proving
   * the widget reached the API. It is never published over the loading state, because
   * this component does not exist during it. And pressing "Try again" remounts this
   * component, which re-publishes a marker the boundary took down.
   */
  useEffect(() => {
    void announceEmbed({ routing, observed: embed.observed, prefix })
  }, [routing, prefix])

  // ⚠ **The client record's `locale` is deliberately NOT read.** The widget's language
  // should match the page it is embedded in, and `<html lang>` says that per page —
  // where a record-level setting says it once for every page a client embeds on, and
  // then becomes a second thing to keep in step with the site around it. So the chain
  // runs: `?locale=` on the page, then this parameter, then the host's `<html lang>`,
  // then the browser, then English — with the viewer's own pick from the settings menu
  // overriding all of it for the session. `config/i18n-options.ts` owns the last
  // three.
  //
  // **`?locale=` outranks this parameter, and that ordering is the point of writing
  // it.** The settings menu publishes a viewer's pick to the page URL, so the link
  // they then copy or reload has to open in the language they chose. Deferring to the
  // script's `locale=` here would revert them on the very next load, on exactly the
  // hosts that pin one, and the shared link would carry a language it does not honour.
  //
  // `pageLocaleOverride` insists the parameter names a language the operator
  // published, rather than merely being present: a junk `?locale=zz` resolves to English
  // through `preferredLocale`, and letting that suppress a host's `locale=fr` would be a
  // worse answer than either party asked for. It reads `window.location` directly,
  // because this is the HOST's URL, which no router of ours describes.
  //
  // ⚠ **This is one of exactly two callers of `applyLocale`** (`config/locale.ts`), the
  // other being `useLocale().setLocale`. A language change is a fetch, a resource write and a
  // `changeLanguage` in that order, and #168 found what happens when more than one place owns
  // that sequence: two of them disagree within a frame, and which one wins is whichever effect
  // React happened to run last.
  //
  // It is a LAYOUT effect, so the switch is decided before the browser paints rather than a
  // frame after it. The bundle may still arrive later — that is a network fact no hook ordering
  // changes — but a cached one (the warm-up above, on this same mount) applies with no paint in
  // between.
  //
  // `defaultLocale` is read through a ref and the effect runs once. The parameter describes the
  // page this widget booted on; re-running on a later change would yank the language back from
  // under a viewer who has since chosen one in the settings menu.
  const initialLocale = useRef(defaultLocale)
  const locales = useAvailableLocales()

  useLayoutEffect(() => {
    const requested =
      pageLocaleOverride(window.location.search, locales) ?? initialLocale.current ?? i18n.language

    void applyLocale(requested, locales)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the set's content: `locales` is rebuilt per render, and each run re-applies the boot locale
  }, [locales.join(',')])

  // Fathom injects OUR tracker script into the HOST's page. ⚠ There is NO host-side
  // opt-out: `analytics="false"` was one, but the element observes no attributes at
  // all (`Widget.tsx`), and the loader parses no such parameter —
  // `docs/embedding.md` lists it among the ignored ones. What actually gates analytics
  // is this build's `VITE_FATHOM_ID` plus the client record's primary domain, and
  // nothing else. Do not restore the claim without restoring the parameter.
  const primaryDomain = useMemo(
    () =>
      client.allowedDomains
        ?.split('\n')
        .map((domain) => domain.trim())
        .find(Boolean) ?? '',
    [client.allowedDomains],
  )

  return (
    <WidgetModeContext.Provider value={{ standalone, hasMap, linkable }}>
      {/* Standalone only. Embedded, this <head> is the HOST page's: their og:locale
          describes their document, not the widget inside it (hence `standalone` existing
          at all).

          ⚠ **`lang`/`dir` on <html> are an OUTPUT here, not an input**, and that is the whole
          asymmetry with the embedded case. Embedded, the host's `<html lang>` describes THEIR
          content and is evidence this widget reads (`hostHtmlLangDetector`). Standalone, the
          document is ours: `index.html` ships `lang="en"` as a pre-hydration placeholder, and
          once a language is resolved it is our job to say so, because WCAG 3.1.1 asks the
          page to declare the language it is actually in. Without this, a French visitor got
          French content inside `<html lang="en">`, and a screen reader read it with English
          pronunciation.

          There is no feedback loop: the detector refuses to read a document carrying our own
          scope class, so writing this back can never become the thing it detects next time. */}
      {standalone && (
        <Helmet htmlAttributes={{ lang: locale, dir: i18n.dir(locale) }}>
          {/* The title for every view that names none; a view's own overrides it. On React 19
              Helmet's `<title>` leaves `<head>` with the view that rendered it, so without this a
              region view would fall back to `index.html`'s English placeholder. */}
          <title>{t('countries.title')}</title>
          <meta content={locale} property="og:locale" />
          {/* The browser's own chrome (iOS's status bar, Android's toolbar) follows the theme
              picked in the settings menu, not the device's. */}
          <meta content={THEME_COLOR[theme]} name="theme-color" />
        </Helmet>
      )}
      {livePreview.active && (
        <Suspense fallback={null}>
          <LivePreviewController />
        </Suspense>
      )}
      <Suspense fallback={<LoadingFallback unboxed={!inline} />}>
        {inline ? (
          <InlineEmbedView homePath={homePath} primaryDomain={primaryDomain} />
        ) : (
          <FullInterface homePath={homePath} primaryDomain={primaryDomain} />
        )}
      </Suspense>
    </WidgetModeContext.Provider>
  )
}
