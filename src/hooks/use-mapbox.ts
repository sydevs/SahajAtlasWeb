import { EasingOptions, PaddingOptions, LngLatBoundsLike } from 'mapbox-gl'
import { useCallback } from 'react'
import { useMap } from 'react-map-gl'
import { create } from 'zustand/react'

import { type FitOptions, fitBoundsOptions, isWithinPaddedViewport } from '@/lib/camera'
import { useCameraSettled } from '@/config/store'

type PaddingState = {
  padding: PaddingOptions
  setPadding: (padding: PaddingOptions) => void
}

export const usePaddingState = create<PaddingState>((set) => ({
  padding: { left: 20, right: 20, top: 20, bottom: 20 },
  setPadding: (padding) => set(() => ({ padding })),
}))

// These are feel knobs for the app's level-to-level camera transitions, `flyTo` and `fitBounds` below.
// Mapbox's `flyTo` coordinates pan and zoom into one smooth arc.
// `curve` sets how far it arcs out to show the path. A lower value gives a flatter arc, with less zoom-out.
// `speed` sets the velocity. A lower value moves slower.
// These values are tuned down from Mapbox's snappy defaults, curve 1.42 and speed 1.2.
const FLY_CURVE = 1.2
const FLY_SPEED = 1.0

// REDUCED MOTION IS ALREADY HANDLED. THIS FILE DELIBERATELY DOES NOT HANDLE IT AGAIN. See issue #102.
//
// This looked like the obvious third place to add a `prefers-reduced-motion` check, beside `providers.tsx` and `styles/vaul.css`.
// It is not the right place.
// mapbox-gl already does this itself, in the same three calls this hook makes.
// `flyTo` short-circuits to `jumpTo` under the preference.
// `easeTo` sets `duration = 0`.
// `fitBounds` reaches one of those two through `_fitInternal`.
// All three gate on `_respectPrefersReducedMotion`, which defaults on.
// That gate reads the media query live, not from a cache. `browser.prefersReducedMotion` re-reads `.matches` on every call.
// So mapbox-gl agrees with our own hook mid-session.
//
// Nothing is lost on the way through.
// `flyTo`'s reduced-motion branch `pick`s `center`, `zoom`, `bearing`, `pitch`, `around`, `padding`, and `retainPadding` into the jump.
// So the drawer offset survives.
// `fitBoundsOptions` below contributes only `maxZoom`, consumed by `cameraForBounds` earlier, and `padding`.
// A hand-rolled branch here would only re-implement this, and could only drift from the branch that actually runs.
//
// Two changes would break this, and both are additions.
// One is setting `respectPrefersReducedMotion: false` on the map.
// The other is passing `essential: true` on a camera call, Mapbox's documented opt-out for camera moves that carry meaning.
// This code uses neither, and it should stay that way.
//
// THE FIRST CAMERA COMMAND OF A SESSION ARRIVES INSTEAD OF FLYING.
//
// The map is uncontrolled and takes no `initialViewState`.
// So it boots showing the world at zoom 0.
// Flying from there to an event's zoom 15 arcs across the planet.
// On a deep link, that arc is several seconds of somewhere nobody asked to see.
// `useCameraSettled` in `config/store.ts` says whether the camera has arrived anywhere yet.
// Until it has, these operations jump instead.
// Everything after that flies exactly as before, which keeps drilling in and backing out symmetric.
//
// Two mechanics are worth stating here.
// Both were measured against mapbox-gl 3.9.2, not assumed, and the obvious guesses are wrong.
//
//  - The instant point move is `jumpTo`. This is exactly what `flyTo`'s own reduced-motion branch delegates to.
//    Its `pick` list keeps `padding` and `retainPadding`, so the drawer offset survives the jump the same way it survives that branch.
//  - The instant bounds fit needs BOTH `linear: true` and `animate: false`.
//    `fitBounds` routes through `_fitInternal`, which picks `easeTo` over `flyTo` when `linear` is set.
//    `easeTo` is the one that honors `animate: false`, by zeroing its duration.
//    `cameraForBounds` has already consumed `maxZoom` and the padding by then, so this loses neither.
//
// This is not a reduced-motion branch, and it must not become one.
// It reads no media query, and it must still never pass `essential: true`.
// Under the preference, mapbox already jumps.
// So the first move makes no real difference, and every later move reaches mapbox's own branch untouched.

/**
 * This claims the session's first camera command.
 * It returns true exactly once, for whichever operation runs first.
 *
 * This reads the flag imperatively, not through a selector.
 * So the operations below do not re-render every consumer of this hook. The map is the hottest render path in the app.
 * This also means the flag is consumed at CALL time.
 * That timing matters: `useFrameOnTop` fires once before react-map-gl has registered the instance.
 * That instance resolves in a microtask after the mounting commit.
 * Each operation bails out on `!mapbox` before reaching here.
 * So that no-op run cannot spend the first move and leave the real one flying.
 */
const arriving = (): boolean => {
  const { settled, markSettled } = useCameraSettled.getState()

  markSettled()

  return !settled
}

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
    // This fits a bounds.
    // `opts` layers a `maxZoom` cap and extra inset over the ambient drawer padding.
    // So a tight or single-event bbox cannot zoom past the cap, and events stay off the edge.
    // Mapbox's `fitBounds` already flies, since `linear` defaults to false and it transitions through `flyTo`, forwarding our curve and speed.
    // So drilling into a region gets the same tuned arc as flying into an event, for free.
    fitBounds: useCallback(
      (bounds: LngLatBoundsLike, opts?: FitOptions) => {
        if (!mapbox) return

        const base = fitBoundsOptions(padding, opts)

        if (arriving()) mapbox.fitBounds(bounds, { ...base, linear: true, animate: false })
        else mapbox.fitBounds(bounds, { ...base, curve: FLY_CURVE, speed: FLY_SPEED })
      },
      [mapbox, padding],
    ),
    // This checks whether an event's point sits inside the padded viewport, the map area the drawer does not cover.
    // So `frameEvent` can keep the zoom for an on-screen pin.
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
    // This is the eased, non-flying camera operation, a plain `easeTo`.
    // `flyTo` and `fitBounds` above are the app's flying level transitions.
    // `moveMap` is the snappy one, kept for two deliberate exceptions: the world reset at zoom 0, and cluster expansion.
    moveMap: useCallback(
      (options: EasingOptions) => {
        if (!mapbox) return

        // This is already an `easeTo`, so nothing about the move changes on the first command.
        // It still marks the camera as arrived.
        // Otherwise, the world reset the root view performs would leave the next command thinking it was the first.
        arriving()

        if (options.padding) {
          changePadding(options.padding)
          mapbox.easeTo(options)
        } else {
          mapbox.easeTo({ ...options, padding })
        }
      },
      [mapbox, padding],
    ),
    // This is the app's standard "move between levels" transition to a point and zoom.
    // It uses Mapbox's built-in `flyTo`, ONE smooth, coordinated pan-and-zoom arc.
    // That arc stays wider mid-flight and zooms in near the target, so the zoom never starts while the target is still crossing the screen.
    // The app uses this for framing an event and for restoring a remembered camera on back navigation.
    // So zooming in and zooming out feel symmetric.
    // A later camera command cancels an in-flight fly.
    // So an interrupting restore or a new frame just takes over cleanly.
    flyTo: useCallback(
      (center: [number, number], zoom: number) => {
        if (!mapbox) return

        if (arriving()) mapbox.jumpTo({ center, zoom, padding })
        else mapbox.flyTo({ center, zoom, padding, curve: FLY_CURVE, speed: FLY_SPEED })
      },
      [mapbox, padding],
    ),
  }
}
