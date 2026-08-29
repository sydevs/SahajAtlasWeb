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

// Feel knobs for the app's level-to-level camera transitions (`flyTo` + `fitBounds`,
// below). Mapbox's flyTo coordinates pan + zoom into one smooth arc; `curve` is how far
// it arcs out to show the path (lower = flatter, less zoom-out) and `speed` is the
// velocity (lower = slower). Tuned off the snappy defaults (curve 1.42 / speed 1.2).
const FLY_CURVE = 1.2
const FLY_SPEED = 1.0

// REDUCED MOTION IS ALREADY HANDLED, AND DELIBERATELY NOT HANDLED HERE (issue #102).
//
// This looked like the obvious third place to add a `prefers-reduced-motion` check,
// beside `providers.tsx` and `styles/vaul.css`. It isn't: mapbox-gl does it itself, in
// the same three calls this hook makes. `flyTo` short-circuits to `jumpTo` under the
// preference, `easeTo` sets `duration = 0`, and `fitBounds` reaches one of them through
// `_fitInternal` — all gated on `_respectPrefersReducedMotion`, which defaults on, and
// on a media-query read that is live rather than cached (`browser.prefersReducedMotion`
// re-reads `.matches` per call), so it agrees with our own hook mid-session.
//
// Nothing is lost on the way through. flyTo's reduced-motion branch `pick`s
// `center/zoom/bearing/pitch/around/padding/retainPadding` into the jump, so the drawer
// offset survives — and `fitBoundsOptions` below contributes only `maxZoom` (consumed by
// `cameraForBounds` before any of this) and `padding`. A hand-rolled branch here would
// therefore be a re-implementation that can only drift from the one that actually runs.
//
// Two ways to break it, both by addition: setting `respectPrefersReducedMotion: false`
// on the map, or passing `essential: true` on a camera call — Mapbox's documented opt-out
// for camera moves that carry meaning. Neither is used, and neither should be.
//
// THE FIRST CAMERA COMMAND OF A SESSION ARRIVES INSTEAD OF FLYING.
//
// The map is uncontrolled and takes no `initialViewState`, so it boots showing the world at
// zoom 0. Flying from there to an event's zoom 15 is an arc across the planet — on a deep link,
// several seconds of somewhere nobody asked to see. `useCameraSettled` (`config/store.ts`) says
// whether the camera has arrived anywhere yet; until it has, these ops jump. Everything after
// flies exactly as before, which is what keeps drilling in and backing out symmetric.
//
// Two mechanics worth stating, because both were measured against mapbox-gl 3.9.2 rather than
// assumed, and the obvious guesses are wrong:
//
//  - the instant point move is `jumpTo`, which is precisely what `flyTo`'s own reduced-motion
//    branch delegates to; its `pick` list keeps `padding`/`retainPadding`, so the drawer offset
//    survives the jump exactly as it survives that one.
//  - the instant bounds fit needs BOTH `linear: true` and `animate: false`. `fitBounds` routes
//    through `_fitInternal`, which picks `easeTo` over `flyTo` on `linear`, and it is `easeTo`
//    that honours `animate: false` by zeroing its duration. `cameraForBounds` has already
//    consumed `maxZoom` and the padding by then, so neither is lost.
//
// This is not a reduced-motion branch and must not become one: it reads no media query, and it
// still must never pass `essential: true`. Under the preference mapbox already jumps, so the
// first move is a no-op difference and every later one reaches mapbox's own branch untouched.

/**
 * Claim the session's first camera command: true exactly once, for whichever op runs first.
 *
 * Read imperatively rather than through a selector, so the ops below don't re-render every
 * consumer of this hook — the map is the hottest render path in the app — and so the flag is
 * consumed at CALL time. That matters: `useFrameOnTop` fires once before react-map-gl has
 * registered the instance (it resolves in a microtask after the mounting commit), and each op
 * bails on `!mapbox` before reaching here, so that no-op run cannot spend the first move and
 * leave the real one flying.
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
    // Fit a bounds. `opts` layers a maxZoom cap + extra inset over the ambient drawer
    // padding (a tight/single-event bbox can't zoom past the cap; events keep off the
    // edge). Mapbox fitBounds already flies — `linear` defaults to false, so it
    // transitions via flyTo and forwards our curve/speed — so drilling into a region
    // gets the same tuned arc as flying into an event, for free.
    fitBounds: useCallback(
      (bounds: LngLatBoundsLike, opts?: FitOptions) => {
        if (!mapbox) return

        const base = fitBoundsOptions(padding, opts)

        if (arriving()) mapbox.fitBounds(bounds, { ...base, linear: true, animate: false })
        else mapbox.fitBounds(bounds, { ...base, curve: FLY_CURVE, speed: FLY_SPEED })
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

        // Already an easeTo, so nothing about the move changes on the first command — but it
        // still marks the camera as arrived, or the world reset the root view performs would
        // leave the next command thinking it was the first.
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
    // The app's standard "move between levels" transition to a point + zoom: Mapbox's
    // built-in flyTo — ONE smooth, coordinated pan+zoom arc (it stays wider mid-flight
    // and zooms in near the target, so the zoom never starts while the target is still
    // crossing the screen). Used for framing an event and restoring a remembered camera
    // on back, so zooming in and out feel symmetric. A later camera command cancels an
    // in-flight fly, so an interrupting restore / new frame just takes over cleanly.
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
