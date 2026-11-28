import { type ReactNode, useEffect, useRef } from 'react'
import * as Fathom from 'fathom-client'
import { useLocation, useNavigate } from 'react-router'
import { MapProvider } from 'react-map-gl/mapbox'

import { useCameraSettled } from '@/config/store'
import { useWidgetMode } from '@/config/mode'
import { Mapbox } from '@/components/organisms/Mapbox'
import { LocatorProvider } from '@/hooks/use-locator'
import { NoopMapControllerProvider } from '@/hooks/use-map-controller'
import { MapboxControllerProvider } from '@/hooks/use-map-controller-mapbox'
import { useTurnstileGuard } from '@/hooks/use-turnstile-guard'
import { DrawerStack } from '@/views'
import { FilterMenus } from '@/components/organisms/FilterMenus'
import { MapControls } from '@/components/organisms/MapControls'
import api from '@/config/api'

/**
 * ⚠ **This module is lazy-loaded, and everything importing react-map-gl is reached from it**
 * (directly, or through `InlineEmbedView`), so none of it is in the eager graph.
 * mapbox-gl is fetched only when the map renders (`mapLib` in `Map.tsx`).
 *
 * Not rendering an element is not always the same as not importing its module. react-map-gl 7
 * fired that `import('mapbox-gl')` at MODULE scope, so while this lived in `App.tsx` every
 * embed downloaded the entire map library on every page view. `pnpm size` could not see it: it
 * budgets the static graph, and a top-level `import()` inside it is a fetch the budget never
 * counts.
 *
 * Keep every `react-map-gl` edge behind this boundary: the map, `MapProvider`, and the REAL
 * camera provider. `NoopMapControllerProvider` is deliberately imported from the seam module,
 * which carries no such edge.
 */
// ⚠ **Module scope, not a ref.** An interface can unmount and remount within one document — a
// host SPA re-rendering the element — while `'fathom' in window` stays TRUE, because this
// project's own script put it there. A ref would reset, the load effect would return early and
// never re-set the flag, and the pageview effect below would short-circuit for the rest of the
// document's life.
//
// `lastTracked` is module scope for the matching reason. The contract is one pageview per real
// NAVIGATION, and remounting on the same route is not one.
let ownsTracker = false
let lastTracked = ''

/**
 * One Fathom pageview per real navigation, under the client's primary domain.
 */
function useAnalytics(primaryDomain: string, pathname: string) {
  const enabled =
    !!import.meta.env.VITE_FATHOM_ID && !!primaryDomain && !primaryDomain.includes('localhost')

  useEffect(() => {
    // The guard asks "is the tracker on this page SOMEBODY ELSE'S". So it must still pass once
    // this project's own tracker is loaded — hence the `ownsTracker` half. `Fathom.load` no-ops
    // on a second call anyway.
    if (!enabled || ownsTracker || 'fathom' in window) return

    ownsTracker = true
    // `auto: false` matters more than it looks. Left on, the default, Fathom's script records
    // the page it lands on — the HOST's real URL, query string and all, which may carry a reset
    // token or an OAuth parameter and is not this project's to send anywhere. The effect below
    // instead reports the widget's own route under the client's primary domain, which is the
    // only thing this is for. `honorDNT` matters because a visitor who set the header has
    // already answered the question.
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
 * zoom 0, while the region or event the visitor actually asked for is still being fetched. This
 * softens that view until the camera has arrived somewhere worth looking at.
 *
 * ⚠ **It blurs the map. It does not hide it, and the canvas must stay opaque for this to mean
 * anything.** `backdrop-filter` filters what is BEHIND the element. So pairing it with an
 * `opacity: 0` canvas, which an earlier version did, leaves nothing to blur, and the tint paints
 * onto the page's own white — a blank screen, rather than a soft map. `Map.tsx` carries the
 * other half of this pairing, and says so.
 *
 * ⚠ **Use `backdrop-blur` on this overlay, never `filter: blur()` on the canvas.** A backdrop
 * filter is the composited path, and leaves the WebGL surface untouched. Filtering the canvas
 * instead forces it into a filtered layer every frame.
 *
 * The blur is deliberately light (`sm`, 4px) over a 20% tint. It has one job — say "not ready
 * yet". The moment it stops reading as a map behind glass, it has become a loading screen,
 * which is a worse answer than the world view it was meant to soften.
 *
 * Module-private, and rendered in exactly one place, per the single-use rule in
 * DESIGN_SYSTEM.md.
 */
function MapCurtain() {
  const settled = useCameraSettled((s) => s.settled)

  if (settled) return null

  return (
    // Not a live region, and nothing drawn on it: the sheet's own loading state already says
    // what is happening, and two ways of saying it is one more than a visitor needs.
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 bg-background/20 backdrop-blur-sm"
    />
  )
}

/** What every interface form is booted with, from the client record. */
export type InterfaceProps = {
  /** Whether `homePath` is known yet: the interface mounts before the client record arrives. */
  clientLoaded: boolean
  homePath?: string
  primaryDomain?: string
}

/**
 * What an interface does once it is on screen: the pageview, the captcha guard, the home
 * redirect, and the cache warm. Called once per interface module, and never by the expanded map
 * an inline embed opens, which is the same interface over the page rather than a second one.
 */
export function useInterfaceBoot({ clientLoaded, homePath, primaryDomain = '' }: InterfaceProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const didInit = useRef(false)

  useAnalytics(primaryDomain, location.pathname)

  // Turnstile injects a third-party script into the host's page. Nothing waits on it — it fails
  // the widget only if it comes back blocked (issue #182).
  useTurnstileGuard()

  // The home route — a path-mode host's `atlas` default, else the configured home region
  // (`homePathFor`) — opens as a RegionView over CountriesView on first load. It replaces the
  // root entry, so opening adds no host history entry (#112). This runs once — re-visiting `/`
  // shows the list, not a redirect loop.
  useEffect(() => {
    if (didInit.current || !clientLoaded) return
    didInit.current = true
    if (location.pathname === '/' && homePath && homePath !== '/')
      navigate(homePath, { replace: true })
  }, [clientLoaded, homePath, location.pathname, navigate])

  // The feed and region tree. Idempotent — React Query deduplicates — so this costs nothing
  // where `App` has already fired it in parallel with the client bootstrap.
  useEffect(() => {
    api.warmCaches()
  }, [])
}

/**
 * The canvas and its curtain, filling whichever box takes the fixed layer: the viewport, the
 * expanded dialog, or the inline embed's map box. Inline fixed/inset, so the map always fills
 * its box behind the drawers, independent of Tailwind viewport-unit utility generation.
 *
 * `cooperative` leaves one-finger and wheel scrolling to the page (`gestures=cooperative`). Never
 * in a map that fills its own window, where nothing scrolls. `controls={false}` leaves the map's
 * corner to its credits, for the inline map, whose controls sit in the toolbar above it.
 */
export function MapLayer({
  cooperative = false,
  controls = true,
  action,
}: {
  cooperative?: boolean
  controls?: boolean
  /** The map's one action, bottom left, placed by Mapbox (`MapAction`). */
  action?: ReactNode
}) {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Mapbox
        action={action}
        controls={
          controls && (
            <MapControls filterMenus={<FilterMenus variant="floating" />} variant="floating" />
          )
        }
        cooperative={cooperative}
      />
      <MapCurtain />
    </div>
  )
}

/**
 * The react-map-gl and camera providers a map needs, or the no-op seam where `map=false` leaves
 * nothing to control. It lives here because this module already owns the react-map-gl boundary.
 */
export function MapProviders({
  children,
  inline = false,
}: {
  children: ReactNode
  inline?: boolean
}) {
  // One locator for the map's find-me and the filters' Near me, gone with this map.
  return (
    <LocatorProvider>
      {useWidgetMode().hasMap ? (
        <MapProvider>
          <MapboxControllerProvider inline={inline}>{children}</MapboxControllerProvider>
        </MapProvider>
      ) : (
        <NoopMapControllerProvider>{children}</NoopMapControllerProvider>
      )}
    </LocatorProvider>
  )
}

/** The map and the drawer stack over it. A map-less atlas is always inline (`App`). */
export function MapInterface() {
  return (
    <MapProviders>
      <MapLayer />
      <DrawerStack />
    </MapProviders>
  )
}

/** The map-first interface: the standalone page opened directly. */
function FullInterface(props: InterfaceProps) {
  useInterfaceBoot(props)

  return <MapInterface />
}

export default FullInterface
