import { useEffect, useRef } from 'react'
import * as Fathom from 'fathom-client'
import { useLocation, useNavigate } from 'react-router'
import { MapProvider } from 'react-map-gl'
import { useTranslation } from 'react-i18next'

import { Spinner } from '@/components/atoms/Spinner'
import { useCameraSettled } from '@/config/store'
import { Mapbox } from '@/components/organisms/Mapbox'
import { NoopMapControllerProvider } from '@/hooks/use-map-controller'
import { RealMapControllerProvider } from '@/hooks/use-map-controller-real'
import { useTurnstileGuard } from '@/hooks/use-turnstile-guard'
import { DrawerStack } from '@/views'
import { MapFrame } from '@/views/MapFrame'
import api from '@/config/api'

/**
 * ⚠ **This module is lazy-loaded, and that is what makes the compact card's promise true.**
 *
 * `react-map-gl`'s `exports-mapbox.js` runs `const mapLib = import('mapbox-gl')` at MODULE
 * scope, so importing it anywhere in the eager graph fetches 485 KiB gz of mapbox-gl whether or
 * not a map renders. While this lived in `App.tsx`, a compact embed — a heading and one button
 * in a 300px sidebar — downloaded the entire map library on every page view, and three docblocks
 * claimed the opposite. Measured in a production build: the chunk firing that import was in
 * `embed.js`'s STATIC closure.
 *
 * Not rendering an element is not the same as not importing its module. `pnpm size` cannot see
 * the difference — it budgets the static graph, and a top-level `import()` inside it is a fetch
 * the budget never counts — which is why the claim survived review for as long as it did.
 *
 * Keep every `react-map-gl` edge behind this boundary: the map, `MapProvider`, and the REAL
 * camera provider. `NoopMapControllerProvider` is deliberately imported from the seam module,
 * which carries no such edge.
 */
// ⚠ **Module scope, not a ref, and this is a bug fix rather than a style choice.** This component
// unmounts every time a compact embed's dialog closes, so a ref resets on the next open — while
// `'fathom' in window` is by then TRUE, because our own script put it there. The load effect would
// return early, never re-set the flag, and the pageview effect below would short-circuit for the
// rest of the document's life: analytics silently dead after the first collapse, in exactly the
// compact form this was moved here to serve. Same reasoning as `autoOpened` in `use-expansion`.
//
// `lastTracked` is module scope for the matching reason: the contract is one pageview per real
// NAVIGATION, and closing and reopening the dialog on the same route is not one.
let ownsTracker = false
let lastTracked = ''

/**
 * One Fathom pageview per real navigation, under the client's primary domain.
 *
 * **It lives with the interface, and that placement is the point.** These effects used to run from
 * `AppShell`, which renders for every embed — including one whose whole appearance is a collapsed
 * card. That recorded a pageview of `/` on every host page view of a sidebar nobody pressed, for an
 * interface nobody opened, and injected our tracker into the host's page to do it. Here it cannot
 * run before the interface does: immediately in the full form, and only on opening in the compact
 * one. The home-region redirect and the cache warm are here for the same reason — a collapsed card
 * should do nothing a visitor did not ask for.
 */
function useAnalytics(primaryDomain: string, pathname: string) {
  const enabled =
    !!import.meta.env.VITE_FATHOM_ID && !!primaryDomain && !primaryDomain.includes('localhost')

  useEffect(() => {
    // The guard is "is the tracker on this page SOMEBODY ELSE'S", so it has to pass once ours is
    // loaded — hence the `ownsTracker` half. `Fathom.load` no-ops on a second call anyway.
    if (!enabled || ownsTracker || 'fathom' in window) return

    ownsTracker = true
    // `auto: false` matters more than it looks: left on (the default), Fathom's script records the
    // page it lands on — the HOST's real URL, query string and all, which may carry a reset token
    // or an OAuth param and is not ours to send anywhere. The effect below reports the widget's own
    // route under the client's primary domain instead, which is the only thing this is for.
    // `honorDNT` because a visitor who set the header has already answered the question.
    Fathom.load(import.meta.env.VITE_FATHOM_ID, { auto: false, honorDNT: true })
  }, [enabled])

  useEffect(() => {
    if (!enabled || !ownsTracker || lastTracked === pathname) return

    lastTracked = pathname
    // `pathname` only — never `location.search`, which carries `?q=` search text, `?center=` and
    // `?cc=`. The route is what this measures.
    Fathom.trackPageview({ url: `https://${primaryDomain}${pathname}` })
  }, [pathname, enabled, primaryDomain])
}

/**
 * The frost over the canvas until the camera has arrived somewhere (issue: deep links used to
 * fly in from the world view).
 *
 * The map is uncontrolled and takes no `initialViewState`, so it necessarily boots at [0, 0]
 * zoom 0 while the region or event the visitor actually asked for is still being fetched. This
 * softens that view until the camera has arrived somewhere worth looking at.
 *
 * ⚠ **It blurs the map; it does not hide it — and the canvas must stay opaque for this to mean
 * anything.** `backdrop-filter` filters what is BEHIND the element, so pairing it with an
 * `opacity: 0` canvas (which an earlier version did) leaves nothing to blur and the tint paints
 * onto the page's own white: a blank screen rather than a soft map. `Map.tsx` carries the other
 * half of this pairing and says so.
 *
 * ⚠ **`backdrop-blur` on this overlay, never `filter: blur()` on the canvas.** A backdrop filter
 * is the composited path and leaves the WebGL surface untouched, where filtering the canvas
 * forces it into a filtered layer every frame.
 *
 * The blur is deliberately light (`sm`, 4px) over a 20% tint. It has one job — say "not ready
 * yet" — and the moment it stops reading as a map behind glass it has become a loading screen,
 * which is a worse answer than the world view it was meant to soften.
 *
 * The spinner fades in on a delay (`sy-map-curtain-spinner`, styles/globals.css) rather than
 * appearing at once, so a warm boot reads as a clean frost→reveal instead of flashing a spinner
 * nobody had time to register. A CSS animation-delay rather than a timer, because there is no
 * state here to schedule against.
 *
 * Module-private and rendered in exactly one place, per the single-use rule in DESIGN_SYSTEM.md.
 */
function MapCurtain() {
  const settled = useCameraSettled((s) => s.settled)
  const { t } = useTranslation('common', { useSuspense: false })

  if (settled) return null

  return (
    <div
      // Not `role="status"`: the drawer's own DrawerLoading already announces the wait, and two
      // live regions describing one boot is one more than a screen reader should hear.
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/20 backdrop-blur-sm"
    >
      <span className="sy-map-curtain-spinner">
        <Spinner decorative size="lg" srLabel={t('loading', { defaultValue: 'Loading' })} />
      </span>
    </div>
  )
}

/** The map (or not) and the drawer stack over it — everything below the form decision. */
function FullInterface({
  contained,
  hasMap,
  homePath,
  primaryDomain = '',
}: {
  /**
   * Map mode lives inside the host's element rather than filling the window (issue #169).
   *
   * Required, like `hasMap` beside it: `AppShell` is the only caller and always passes it, and
   * a default of `false` would be the one wrong answer nobody could see — it is the common case.
   */
  contained: boolean
  hasMap: boolean
  homePath?: string
  primaryDomain?: string
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const didInit = useRef(false)

  useAnalytics(primaryDomain, location.pathname)

  // Turnstile is loaded here for the same reason the analytics, the redirect and the cache
  // warm are: it injects a third-party script into the host's page, so it must not fire for
  // a collapsed compact card. Nothing waits on it — it fails the widget only if it comes
  // back blocked (issue #182).
  useTurnstileGuard()

  // The configured home region opens as a RegionView over CountriesView on first load; Back
  // returns to the global list. Runs once — re-visiting `/` shows the list, not a redirect loop.
  //
  // ⚠ **It lives here rather than in `AppShell`, and that placement is the point.** This
  // component renders only when the interface is actually on screen — always in the full form,
  // and only once the dialog opens in the compact one. In `AppShell` it fired while a collapsed
  // card was the only thing rendered, and `navigate` pushes `?atlas=/nl` onto the HOST's URL. A
  // visitor who then reloaded, bookmarked or shared that address got a full-screen dialog over
  // the host's page on load, having never asked for one — auto-open triggered by our own
  // bookkeeping rather than by a link anybody followed.
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    if (location.pathname === '/' && homePath && homePath !== '/') navigate(homePath)
  }, [homePath, location.pathname, navigate])

  // The feed + region tree, warmed when the interface actually mounts. `App` skips this for a
  // compact embed precisely so a collapsed card costs nothing, which leaves the expanded case to
  // us. Idempotent — React Query dedupes — so the full form, where `App` has already fired it in
  // parallel with the client bootstrap, pays nothing for the second call.
  useEffect(() => {
    api.warmCaches()
  }, [])

  return hasMap ? (
    <MapProvider>
      {/* ⚠ **`MapFrame` is the ONLY thing that differs between a viewport map and a contained
          one.** Everything below is byte-identical in both: the canvas stays `position: fixed;
          inset: 0`, the drawers and peek strips stay fixed, and no view branches on which one
          it is. `contain: layout` on the frame re-parents the whole fixed layer onto the
          host's box, which is what makes that possible — the alternative, a `fixed` →
          `absolute` swap, is what made containment look intractable until #161 solved both of
          its obstacles for the expanded dialog (see `MapFrame` for the pair, and #169 for the
          argument that the comment which used to sit here had gone stale).

          Unframed, map mode still fills the browser window whatever slot the host gave the
          element — a documented requirement (#107), and now the answer only for a host who
          gave it no height. One that does not have the page to itself AND did not size it gets
          the compact card rather than a takeover: `lib/slot-decision.ts` measures at mount and
          `AppShell` renders `CompactEmbedView`, whose button opens the map full-screen. */}
      <MapFrame contained={contained}>
        {/* Inline fixed/inset so the map always fills its frame behind the drawers —
            independent of Tailwind viewport-unit utility generation. */}
        <div style={{ position: 'fixed', inset: 0 }}>
          <Mapbox />
          <MapCurtain />
        </div>
        <RealMapControllerProvider>
          <DrawerStack />
        </RealMapControllerProvider>
      </MapFrame>
    </MapProvider>
  ) : (
    <NoopMapControllerProvider>
      <DrawerStack />
    </NoopMapControllerProvider>
  )
}

export default FullInterface
