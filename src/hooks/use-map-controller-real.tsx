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

// These are the fixed left-drawer footprint and the mobile peek height.
// The code feeds them to map padding directly, so the camera and controls stay unoccluded.
// This never DOM-measures the panel.
//
// **`DRAWER_W_REM` is one half of a pair. See the other half before you change it.**
// The drawer's actual width comes from a `22rem` fallback baked into its Tailwind classes.
// That fallback is `w-[var(--sy-drawer-w,22rem)]`, in `components/atoms/Drawer/Drawer.tsx` and `views/DrawerStack/DrawerStack.tsx`.
// `DrawerStack`'s `SettingsMenu` offset reads the same variable.
// A class string cannot read a value from this file, because the Tailwind JIT scanner needs a literal.
// So you must keep the two values in step by hand.
// Moving only one value throws no error.
// The map's camera padding then stops matching the panel that occludes it, and the framing goes quietly wrong by the difference.
//
// `use-map-controller.test.ts` scans those files. It fails if any fallback stops matching this constant.
// That test exists because comments alone did not hold.
// The first version of this pairing named two files and missed two of the five literals.
//
// The rem-to-px conversion assumes the browser's default 16px root font.
// Two things can desync this value without touching either literal.
// One is a host that restyles the root font size.
// The other is a host that overrides the `--sy-drawer-w` custom property. Nothing in this repo sets it today, so the fallback always wins.
// Reading the resolved variable at runtime would cover both cases.
// This code rejects that approach, because it would put a DOM read in the map's hot path, to serve an override that is not a supported feature yet.
// If a host is ever invited to set that variable, this is the constant that must start resolving it.
const DRAWER_W_REM = 22
const LEFT_DRAWER_PX = DRAWER_W_REM * 16
const MOBILE_PEEK_PX = 128
const MAP_MARGIN = 20

// These constants keep zoom consistent.
// An event frames at `EVENT_ZOOM`.
// A region fits no closer than `REGION_MAX_ZOOM`, 2 levels wider.
// So clicking an event from its region is always a zoom-in, never a jarring zoom-out.
// `REGION_FIT_PADDING` keeps edge events off the map border.
const EVENT_ZOOM = 15
const REGION_MAX_ZOOM = 13
const REGION_FIT_PADDING = 48
// An online event has only an approximate location.
// This frames it wide, at city or area level, when a deep link makes it the session entry point.
const ONLINE_ZOOM = 7

// This is the map point an event emphasizes: its stored coordinates.
// It tags online events as `approximate`, which gives them a softer area sprite and a wider zoom.
// It returns null when the event has no coordinates, since there is nothing to frame or highlight.
// `frameEvent` and `highlightEvent` share this function, so both derive the point identically.
// `frameEvent` commits the point to `selection` and moves the camera. `highlightEvent` only sets `hover`.
const eventPoint = (event: Pick<EventSlim, 'address' | 'eventType'>) => {
  const { latitude, longitude } = event.address ?? {}

  if (latitude == null || longitude == null) return null

  return { latitude, longitude, approximate: isOnline(event) }
}

/**
 * This is the real camera provider.
 * It is split out of `use-map-controller.tsx`, so that module can stay free of `react-map-gl`.
 * See the warning at the top of that module.
 * The app reaches this provider only through the lazy `FullInterface`.
 * So a compact embed never loads this provider or mapbox-gl.
 */
export function RealMapControllerProvider({ children }: { children: ReactNode }) {
  const { mapbox, moveMap, fitBounds, isPointVisible, flyTo } = useMapbox()
  const setPadding = usePaddingState((s) => s.setPadding)
  const setSelection = useViewState((s) => s.setSelection)
  const setHover = useViewState((s) => s.setHover)
  const setBoundary = useViewState((s) => s.setBoundary)
  // This is the box the map actually occupies.
  // It is the frame when a contained embed, or the compact card's expanded dialog, has taken the containing block. See issue #169.
  // Otherwise it is the viewport, which is what this value computed before frames existed.
  //
  // **This must be the same box `DrawerStack` measures.** This value pads the camera around the panel that box decides.
  // Before #169, the viewport was that box by construction, because map mode spanned it.
  // So reading `useIsWideViewport` agreed with it only by luck of a shared crossing.
  // A contained 600px map breaks that agreement.
  // The drawer becomes a bottom sheet, while a viewport read would still reserve 22rem of camera on the left for a panel that is not there.
  //
  // This code cannot read `WidgetWidthContext` instead.
  // `DrawerStack` provides that context, and this provider RENDERS `DrawerStack`.
  // `frameElement()` is a shared node, not a shared context, so both sides can reach it.
  // This is also why `MapFrame` publishes that node in the layout phase, before either side first renders.
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
        // The emphasized point belongs to whatever framed the camera last.
        // So framing a region drops the event pin. See the note on `frameSearch`.
        setSelection(null)
        // A venue is a point, not an area.
        // So this frames it by flying to its derived center, instead of fitting its zero-area bbox.
        if (region.level === 'venue') {
          setBoundary(undefined)
          if (region.center) flyTo(region.center, REGION_MAX_ZOOM)
        } else if (region.bounds) {
          setBoundary(bboxPolygon(region.bounds))
          // This caps the fit and pads the edges.
          // A single-event or tight-event region cannot zoom past `REGION_MAX_ZOOM`. This cap has no effect on a large region that already fits wider.
          // The padding keeps events clear of the border.
          fitBounds(region.bounds, { maxZoom: REGION_MAX_ZOOM, padding: REGION_FIT_PADDING })
        } else {
          setBoundary(undefined)
        }
      },
      frameEvent(event, opts) {
        const point = eventPoint(event)

        if (!point) return

        setSelection(point)
        // This moves the camera only as needed.
        // `atDetailZoom` reads the LIVE map zoom, not the store's moveEnd-lagged value.
        // So a genuine pin click at a detail zoom keeps that zoom.
        // A deep link, a wide-view click, or an off-screen click still eases in.
        const zoom = eventFrameZoom({
          approximate: point.approximate,
          visible: isPointVisible(point.longitude, point.latitude),
          atDetailZoom: (mapbox?.getZoom() ?? 0) >= REGION_MAX_ZOOM,
          isEntry: opts?.isEntry ?? false,
          eventZoom: EVENT_ZOOM,
          onlineZoom: ONLINE_ZOOM,
        })

        // This flies in as one smooth arc, through Mapbox's `flyTo`.
        // The zoom happens near the target, not while the event is still crossing the screen.
        if (zoom != null) flyTo([point.longitude, point.latitude], zoom)
      },
      highlightEvent(event) {
        setHover(event ? eventPoint(event) : null)
      },
      frameSearch({ bbox, center }) {
        // **The framing call owns the emphasized point, not a view's unmount.**
        // `EventView` used to clear the point from an effect cleanup instead.
        // That cleanup runs 150ms AFTER the incoming view has already framed.
        // So on a back navigation, it wiped the selection and boundary that `restore` had just reinstated.
        // Its dependency was the controller's identity.
        // So a resize while an event was open cleared the pin, with no navigation at all.
        setSelection(null)
        setBoundary(undefined)
        if (bbox) fitBounds(bbox, { maxZoom: REGION_MAX_ZOOM, padding: REGION_FIT_PADDING })
        else if (center) flyTo(center, EVENT_ZOOM)
        // No bbox and no center means nothing was searched.
        // So there is nothing to frame, and the camera stays where the visitor left it.
        // This code used to reset the camera to the world view instead.
        // That reset threw the map to zoom 0 when a visitor pressed Search from a region.
        // `SearchView` was, at that same moment, snapshotting that camera to rank results by.
        // Framing the world is something only the root view wants. It asks for that framing by name, through `reset()`.
      },
      restore(camera) {
        setSelection(camera.selection ?? null)
        setBoundary(camera.boundary)
        // This flies back to the remembered viewport.
        // So going back reads as smoothly as going in, such as the zoom-out from an event to its region.
        // It never reads as a sudden jump.
        flyTo([camera.longitude, camera.latitude], camera.zoom)
      },
      reset() {
        // Like the two framing calls, this function owns the emphasized point.
        // The root view shows the whole world, and a pin for the class a viewer was just looking at has no place on it.
        // A viewer reaches this by pressing the root peek strip out of an event, which is a PUSH.
        // `restore` would have reinstated the pin only for a POP.
        setSelection(null)
        setBoundary(undefined)
        moveMap({ zoom: 0 })
      },
    }),
    [mapbox, moveMap, fitBounds, isPointVisible, flyTo, setSelection, setHover, setBoundary],
  )

  return (
    <MapControllerContext.Provider value={controller}>{children}</MapControllerContext.Provider>
  )
}
