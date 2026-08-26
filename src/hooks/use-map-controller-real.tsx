import type { EventSlim } from '@/types'
import type { MapController } from './use-map-controller'

import { type ReactNode, useEffect, useMemo } from 'react'
import { bboxPolygon } from '@turf/bbox-polygon'

import { MapControllerContext } from './use-map-controller'

import { useMapbox, usePaddingState } from '@/hooks/use-mapbox'
import { useViewState } from '@/config/store'
import { useIsWide } from '@/config/responsive'
import { eventFrameZoom } from '@/lib/camera'
import { isOnline } from '@/lib/shape'
import { frameElement } from '@/lib/overlay'

// The fixed left-drawer footprint and the mobile peek height, fed to map padding
// directly — so the camera/controls aren't occluded, without ever DOM-measuring the panel.
//
// **`DRAWER_W_REM` is one half of a pair — see the other half before changing it.** The
// drawer's actual width is the `22rem` fallback baked into its Tailwind classes,
// `w-[var(--sy-drawer-w,22rem)]` in `components/atoms/Drawer/Drawer.tsx` and
// `views/DrawerStack/DrawerStack.tsx` (whose SettingsMenu offset reads the same variable).
// A class string can't read a value from here — the Tailwind JIT scanner needs a literal —
// so the two can only be kept in step by hand. Move one alone and nothing throws: the
// map's camera padding just stops matching the panel that occludes it, and the framing is
// quietly wrong by the difference.
//
// `use-map-controller.test.ts` scans those files and fails if any fallback stops matching
// this constant. That test exists because comments alone demonstrably did not hold — the
// first version of this pairing named two files and missed two of the five literals.
//
// The rem→px conversion assumes the browser default 16px root font. Two things therefore
// desync this without touching either literal: a host that restyles the root font size,
// and a host that overrides the `--sy-drawer-w` custom property (nothing in this repo
// sets it, so today the fallback always wins). Reading the resolved variable at runtime
// would cover both and was considered — and rejected, because it puts a DOM read in the
// map's hot path to serve an override that is not a supported feature yet. If hosts are
// ever invited to set that variable, this is the constant that has to start resolving it.
const DRAWER_W_REM = 22
const LEFT_DRAWER_PX = DRAWER_W_REM * 16
const MOBILE_PEEK_PX = 128
const MAP_MARGIN = 20

// consistent zoom-in: an event frames at EVENT_ZOOM; a region fits no closer than
// REGION_MAX_ZOOM (2 levels wider, so clicking its event is always a zoom-in, never
// a jarring zoom-out); REGION_FIT_PADDING keeps edge events off the map border.
const EVENT_ZOOM = 15
const REGION_MAX_ZOOM = 13
const REGION_FIT_PADDING = 48
// An online event has only an approximate location; frame it wide (city/area level)
// when a deep link makes it the session entry point.
const ONLINE_ZOOM = 7

// The map point an event emphasizes: its stored coordinates, tagged `approximate`
// for online events (softer area sprite + a wider zoom). Null when the event has
// no coordinates — nothing to frame or highlight. Shared so frameEvent (commits it
// to `selection` + moves the camera) and highlightEvent (sets `hover` only) derive
// the point identically.
const eventPoint = (event: Pick<EventSlim, 'address' | 'eventType'>) => {
  const { latitude, longitude } = event.address ?? {}

  if (latitude == null || longitude == null) return null

  return { latitude, longitude, approximate: isOnline(event) }
}

/**
 * The real camera provider — split out of `use-map-controller.tsx` so that module can stay free
 * of `react-map-gl` (see the warning at the top of it). Reached only through the lazy
 * `FullInterface`, so a compact embed never loads it or mapbox-gl.
 */
export function RealMapControllerProvider({ children }: { children: ReactNode }) {
  const { mapbox, moveMap, fitBounds, isPointVisible, flyTo } = useMapbox()
  const setPadding = usePaddingState((s) => s.setPadding)
  const setSelection = useViewState((s) => s.setSelection)
  const setHover = useViewState((s) => s.setHover)
  const setBoundary = useViewState((s) => s.setBoundary)
  // The box the map actually occupies — the frame when a contained embed or the compact
  // card's expanded dialog has taken the containing block (issue #169), and the viewport
  // otherwise, which is what this computed before frames existed.
  //
  // **It has to be the same box `DrawerStack` measures, because this pads the camera around
  // the panel that box decides.** Until #169 the viewport was that box by construction —
  // map mode spanned it — so reading `useIsWideViewport` agreed by luck of the crossing
  // being shared. A contained 600px map breaks that: the drawer becomes a bottom sheet
  // while a viewport read still reserves 22rem of camera on the left for a panel that is
  // not there.
  //
  // It cannot read `WidgetWidthContext` instead: that is provided by `DrawerStack`, which
  // this provider RENDERS. `frameElement()` is the shared node rather than a shared context,
  // which is why both can reach it — and why `MapFrame` publishes it in the layout phase,
  // before either of us first renders.
  const isWide = useIsWide(frameElement())

  // Keep the drawer's known footprint out of the usable camera area.
  useEffect(() => {
    setPadding({
      left: MAP_MARGIN + (isWide ? LEFT_DRAWER_PX : 0),
      right: MAP_MARGIN,
      top: MAP_MARGIN,
      bottom: MAP_MARGIN + (isWide ? 0 : MOBILE_PEEK_PX),
    })
  }, [isWide, setPadding])

  const controller = useMemo<MapController>(
    () => ({
      hasMap: true,
      frameRegion(region) {
        // A venue is a point, not an area — frame it by flying to its derived
        // centre rather than fitting its (degenerate, zero-area) bbox.
        if (region.level === 'venue') {
          setBoundary(undefined)
          if (region.center) flyTo(region.center, REGION_MAX_ZOOM)
        } else if (region.bounds) {
          setBoundary(bboxPolygon(region.bounds))
          // Cap the fit + pad the edges: a single-/tight-event region can't zoom past
          // REGION_MAX_ZOOM (no-op on a large region that fits wider), and events keep
          // breathing room from the border.
          fitBounds(region.bounds, { maxZoom: REGION_MAX_ZOOM, padding: REGION_FIT_PADDING })
        } else {
          setBoundary(undefined)
        }
      },
      frameEvent(event, opts) {
        const point = eventPoint(event)

        if (!point) return

        setSelection(point)
        // Move only as needed. `atDetailZoom` reads the LIVE map zoom (not the moveEnd-
        // lagged store) so a genuine pin click at a detail zoom keeps its zoom, while a
        // deep link / wide-view / off-screen click still eases in.
        const zoom = eventFrameZoom({
          approximate: point.approximate,
          visible: isPointVisible(point.longitude, point.latitude),
          atDetailZoom: (mapbox?.getZoom() ?? 0) >= REGION_MAX_ZOOM,
          isEntry: opts?.isEntry ?? false,
          eventZoom: EVENT_ZOOM,
          onlineZoom: ONLINE_ZOOM,
        })

        // Fly in as one smooth arc (Mapbox flyTo) — the zoom happens near the target,
        // not while the event is still crossing the screen.
        if (zoom != null) flyTo([point.longitude, point.latitude], zoom)
      },
      highlightEvent(event) {
        setHover(event ? eventPoint(event) : null)
      },
      frameSearch({ bbox, center }) {
        setBoundary(undefined)
        if (bbox) fitBounds(bbox, { maxZoom: REGION_MAX_ZOOM, padding: REGION_FIT_PADDING })
        else if (center) flyTo(center, EVENT_ZOOM)
        else moveMap({ zoom: 0 })
      },
      restore(camera) {
        setSelection(camera.selection ?? null)
        setBoundary(camera.boundary)
        // Fly back to the remembered viewport so going back reads as smoothly as going
        // in (e.g. the zoom-out from an event to its region), not a snappy jump.
        flyTo([camera.longitude, camera.latitude], camera.zoom)
      },
      reset() {
        setBoundary(undefined)
        moveMap({ zoom: 0 })
      },
      clearSelection() {
        setSelection(null)
        setBoundary(undefined)
      },
    }),
    [mapbox, moveMap, fitBounds, isPointVisible, flyTo, setSelection, setHover, setBoundary],
  )

  return (
    <MapControllerContext.Provider value={controller}>{children}</MapControllerContext.Provider>
  )
}
