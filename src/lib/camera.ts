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
 * Whether `frameEvent` should ease the camera to the event — "move only as needed".
 * Selecting the marker happens unconditionally; the camera moves only for a located
 * event that's off-screen (list / search click). An online/approximate event (no real
 * location) and an on-screen pin (already visible — a pin click) both stay put.
 */
export const shouldMoveToEvent = (approximate: boolean, visible: boolean): boolean =>
  !approximate && !visible
