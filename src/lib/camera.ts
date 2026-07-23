import type { PaddingOptions } from 'mapbox-gl'

/**
 * Pure camera-decision helpers, split out of the map controller / mapbox hook so
 * they unit-test without a live map. The controller owns the zoom *values*
 * (EVENT_ZOOM / REGION_MAX_ZOOM / REGION_FIT_PADDING) and passes them in; these
 * functions only decide the *shape* of the move.
 */

/** Extra options fitBounds accepts on top of the ambient drawer padding. */
export type FitOptions = {
  /** Cap the fit zoom (a tight/single-event bbox can't zoom past this). */
  maxZoom?: number
  /** Uniform px added to every side of the base padding, so events aren't flush to the edge. */
  padding?: number
}

/**
 * Merge the ambient drawer padding with an extra uniform inset for a fitBounds
 * call. Keeps the drawer's known footprint out of the camera *and* leaves
 * breathing room around edge events — without DOM-measuring the panel.
 */
export const fitBoundsOptions = (
  base: PaddingOptions,
  opts?: FitOptions,
): { maxZoom?: number; padding: PaddingOptions } => {
  const extra = opts?.padding ?? 0

  return {
    maxZoom: opts?.maxZoom,
    padding: {
      top: (base.top ?? 0) + extra,
      bottom: (base.bottom ?? 0) + extra,
      left: (base.left ?? 0) + extra,
      right: (base.right ?? 0) + extra,
    },
  }
}

/**
 * Whether a projected screen point sits inside the *padded* viewport — the visible
 * map area minus the drawer footprint. `frameEvent` uses it to keep the zoom for a
 * pin that's already on screen and only ease to an off-screen one.
 */
export const isWithinPaddedViewport = (
  point: { x: number; y: number },
  size: { width: number; height: number },
  padding: PaddingOptions,
): boolean =>
  point.x >= (padding.left ?? 0) &&
  point.x <= size.width - (padding.right ?? 0) &&
  point.y >= (padding.top ?? 0) &&
  point.y <= size.height - (padding.bottom ?? 0)

/**
 * The zoom `frameEvent` should ease to, or `null` to stay put — "move only as needed"
 * (selecting the marker happens unconditionally, separately).
 *
 * - **Online / approximate** events have no real location: frame their stored point
 *   only as the session entry point (a deep link); in-session, selecting one never
 *   moves the camera.
 * - **Located** events ease in to the event zoom on entry, from a wider view, or when
 *   off-screen. Only a genuine pin click — already on-screen *and* already at a detail
 *   zoom (`atDetailZoom`) — keeps the current zoom, so it doesn't nudge the camera.
 *   `atDetailZoom` is the guard that stops the boot-time world view (zoom 0, where any
 *   point projects as "visible") from reading as "already showing the event".
 */
export const eventFrameZoom = (opts: {
  approximate: boolean
  visible: boolean
  atDetailZoom: boolean
  isEntry: boolean
  eventZoom: number
  onlineZoom: number
}): number | null => {
  if (opts.approximate) return opts.isEntry ? opts.onlineZoom : null
  if (!opts.isEntry && opts.visible && opts.atDetailZoom) return null

  return opts.eventZoom
}
