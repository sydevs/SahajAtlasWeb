import { EasingOptions, PaddingOptions, LngLatBoundsLike } from 'mapbox-gl'
import { useCallback } from 'react'
import { useMap } from 'react-map-gl'
import { create } from 'zustand/react'

import { type FitOptions, fitBoundsOptions, isWithinPaddedViewport } from '@/lib/camera'

type PaddingState = {
  padding: PaddingOptions
  setPadding: (padding: PaddingOptions) => void
}

export const usePaddingState = create<PaddingState>((set) => ({
  padding: { left: 20, right: 20, top: 20, bottom: 20 },
  setPadding: (padding) => set(() => ({ padding })),
}))

// Feel knobs for the app's level-to-level camera transitions (`flyTo` + `fitBounds`,
// below). Mapbox's flyTo coordinates pan + zoom into one smooth arc; `curve` is how far
// it arcs out to show the path (lower = flatter, less zoom-out) and `speed` is the
// velocity (lower = slower). Tuned off the snappy defaults (curve 1.42 / speed 1.2).
const FLY_CURVE = 1.2
const FLY_SPEED = 1.0

export function useMapbox() {
  const { mapbox } = useMap()
  const padding = usePaddingState((s) => s.padding)
  const setPadding = usePaddingState((s) => s.setPadding)

  const changePadding = (pad: number | PaddingOptions) => {
    if (typeof pad === 'number') {
      setPadding({ left: pad, right: pad, top: pad, bottom: pad })
    } else {
      setPadding({
        left: pad.left || 0,
        right: pad.right || 0,
        top: pad.top || 0,
        bottom: pad.bottom || 0,
      })
    }
  }

  return {
    mapbox,
    padding,
    setPadding: changePadding,
    // Fit a bounds. `opts` layers a maxZoom cap + extra inset over the ambient drawer
    // padding (a tight/single-event bbox can't zoom past the cap; events keep off the
    // edge). Mapbox fitBounds already flies — `linear` defaults to false, so it
    // transitions via flyTo and forwards our curve/speed — so drilling into a region
    // gets the same tuned arc as flying into an event, for free.
    fitBounds: useCallback(
      (bounds: LngLatBoundsLike, opts?: FitOptions) => {
        mapbox?.fitBounds(bounds, {
          ...fitBoundsOptions(padding, opts),
          curve: FLY_CURVE,
          speed: FLY_SPEED,
        })
      },
      [mapbox, padding],
    ),
    // Whether an event's point is inside the padded viewport (the map area not
    // covered by the drawer) — so frameEvent can keep the zoom for an on-screen pin.
    isPointVisible: useCallback(
      (longitude: number, latitude: number) => {
        if (!mapbox) return false

        const { x, y } = mapbox.project([longitude, latitude])
        const container = mapbox.getContainer()

        return isWithinPaddedViewport(
          { x, y },
          { width: container.clientWidth, height: container.clientHeight },
          padding,
        )
      },
      [mapbox, padding],
    ),
    // The eased (non-flying) camera op — a plain easeTo. `flyTo` / `fitBounds` above are
    // the app's flying level transitions; `moveMap` is the snappy one, kept for the
    // deliberate exceptions: the world reset (zoom 0) and cluster expansion.
    moveMap: useCallback(
      (options: EasingOptions) => {
        if (!mapbox) return

        if (options.padding) {
          changePadding(options.padding)
          mapbox.easeTo(options)
        } else {
          mapbox.easeTo({ ...options, padding })
        }
      },
      [mapbox, padding],
    ),
    // The app's standard "move between levels" transition to a point + zoom: Mapbox's
    // built-in flyTo — ONE smooth, coordinated pan+zoom arc (it stays wider mid-flight
    // and zooms in near the target, so the zoom never starts while the target is still
    // crossing the screen). Used for framing an event and restoring a remembered camera
    // on back, so zooming in and out feel symmetric. A later camera command cancels an
    // in-flight fly, so an interrupting restore / new frame just takes over cleanly.
    flyTo: useCallback(
      (center: [number, number], zoom: number) => {
        mapbox?.flyTo({ center, zoom, padding, curve: FLY_CURVE, speed: FLY_SPEED })
      },
      [mapbox, padding],
    ),
  }
}
