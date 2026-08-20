import { MapProvider } from 'react-map-gl'

import { Mapbox } from '@/components/organisms/Mapbox'
import { NoopMapControllerProvider } from '@/hooks/use-map-controller'
import { RealMapControllerProvider } from '@/hooks/use-map-controller-real'
import { DrawerStack } from '@/views'

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
/** The map (or not) and the drawer stack over it — everything below the form decision. */
function FullInterface({ hasMap }: { hasMap: boolean }) {
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
