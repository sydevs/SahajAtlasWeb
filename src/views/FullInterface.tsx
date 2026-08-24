import { useEffect, useRef } from 'react'
import * as Fathom from 'fathom-client'
import { useLocation, useNavigate } from 'react-router'
import { MapProvider } from 'react-map-gl'

import { Mapbox } from '@/components/organisms/Mapbox'
import { NoopMapControllerProvider } from '@/hooks/use-map-controller'
import { RealMapControllerProvider } from '@/hooks/use-map-controller-real'
import { DrawerStack } from '@/views'
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

/** The map (or not) and the drawer stack over it — everything below the form decision. */
function FullInterface({
  hasMap,
  homePath,
  primaryDomain = '',
}: {
  hasMap: boolean
  homePath?: string
  primaryDomain?: string
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const didInit = useRef(false)

  useAnalytics(primaryDomain, location.pathname)

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
      {/* Inline fixed/inset so the map always fills the viewport behind the
              drawers — independent of Tailwind viewport-unit utility generation.

              **This is why map mode requires a FULL-PAGE slot, and issue #107 settled
              that as a documented requirement rather than containing it.** The canvas
              covers the viewport whatever size the host made `<sahaj-atlas>`, and the
              drawers over it are `fixed` too. Containing the lot is not a `fixed` →
              `absolute` swap: vaul computes a snap-point sheet's translate from the
              WINDOW height (see the `bottom` variant in `atoms/Drawer/Drawer.tsx`), so a
              contained sheet is pushed off-screen by the library's own arithmetic, and
              `--sy-sheet-top` — which pins the sticky Register bar — is a viewport-
              relative measurement for the same reason. `map="false"` is the mode that
              stays inside its box, and it is container-relative throughout (#107).
              A host that gets this wrong now gets the compact card instead of a takeover:
              `lib/slot-decision.ts` measures at mount and `AppShell` renders `CompactEmbedView`,
              whose button opens the map full-screen. */}
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
  )
}

export default FullInterface
