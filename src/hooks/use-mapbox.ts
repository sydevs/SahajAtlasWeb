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
    // `opts` layers a maxZoom cap + extra inset over the ambient drawer padding
    // (a tight/single-event bbox can't zoom past the cap; events keep off the edge).
    fitBounds: useCallback(
      (bounds: LngLatBoundsLike, opts?: FitOptions) => {
        mapbox?.fitBounds(bounds, fitBoundsOptions(padding, opts))
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
  }
}
