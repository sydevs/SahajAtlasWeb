import type { PaddingOptions } from 'mapbox-gl'

/**
 * Pure camera-decision helpers, split out of the map controller / mapbox hook so
 * they unit-test without a live map. The controller owns the zoom *values*
 * (EVENT_ZOOM / REGION_MAX_ZOOM / REGION_FIT_PADDING) and passes them in. These
 * functions only decide the *shape* of the move.
 */

/** Extra options fitBounds accepts on top of the ambient drawer padding. */
export type FitOptions = {
  /** Cap the fit zoom. A tight or single-event bbox cannot zoom past this. */
  maxZoom?: number
  /** Uniform px added to every side of the base padding, so events are not flush to the edge. */
  padding?: number
  /** Extra px at the bottom only, for a phone sheet that stands taller than the usual peek. */
  bottom?: number
}

/**
 * Merges the ambient drawer padding with an extra uniform inset for a fitBounds
 * call. This keeps the drawer's known footprint out of the camera, and leaves
 * breathing room around edge events, without DOM-measuring the panel.
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
      bottom: (base.bottom ?? 0) + extra + (opts?.bottom ?? 0),
      left: (base.left ?? 0) + extra,
      right: (base.right ?? 0) + extra,
    },
  }
}

/**
 * Whether a projected screen point sits inside the *padded* viewport: the visible
 * map area minus the drawer footprint. `frameEvent` uses it to keep the zoom for a
 * pin that is already on screen, and only ease to an off-screen one.
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
 * The zoom `frameEvent` should ease to, or `null` to stay put: "move only as needed"
 * (selecting the marker happens unconditionally, separately).
 *
 * - **Online / approximate** events have no real location. This frames their stored
 *   point only as the session entry point (a deep link). In-session, selecting one
 *   never moves the camera.
 * - **Located** events ease in to the event zoom on entry, from a wider view, or when
 *   off-screen. Only a genuine pin click — already on-screen *and* already at a detail
 *   zoom (`atDetailZoom`) — keeps the current zoom, so it does not nudge the camera.
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

/** An event as the feed may serve it: either stored coordinate can be absent or null. */
type MaybePlacedEvent = {
  address?: { latitude?: number | null; longitude?: number | null } | null
}

/** The same event once both coordinates are known to be there. */
type PlacedEvent = { address: { latitude: number; longitude: number } }

/**
 * Whether an event has a stored point to frame. An online event often has none: it has
 * no place of its own, so a deep link to it frames its parent region instead.
 *
 * It narrows, so `eventPoint` (`use-map-controller-real.tsx`) reads the coordinates
 * through this one verdict instead of re-testing them. Two tests that disagreed would
 * leave `frameEvent` running on an event it then frames nothing for.
 */
export const hasMapPoint = <T extends MaybePlacedEvent>(event: T): event is T & PlacedEvent =>
  event.address?.latitude != null && event.address?.longitude != null

/** Mapbox's world is this many px wide at zoom 0, and doubles with each zoom level. */
const WORLD_PX_AT_ZOOM_0 = 512

/**
 * The lowest zoom at which one world is as wide as the map, so zooming out never shows it twice.
 * Only the width counts: a tall phone map may still show the poles' empty band, as it always has,
 * and a wide region's fit on a phone keeps the zoom it needs.
 */
export const worldMinZoom = (width: number): number =>
  width > WORLD_PX_AT_ZOOM_0 ? Math.log2(width / WORLD_PX_AT_ZOOM_0) : 0

/**
 * The camera for the world view: the world once, filling the map, with no blank edge.
 *
 * The map keeps Mapbox's world copies, so it still wraps across the antimeridian. The world view
 * shows the world once by making it at least as wide (and as tall) as the canvas, with no edge
 * left for a copy to show in. Our padding is lopsided, though: the side panel on the left, only a
 * margin on the right. So the padded centre sits right of the canvas centre, and a world exactly
 * as wide as the canvas would be drawn shifted right by half the difference, with a copy's edge
 * in a strip at the map's left (176px on a desktop).
 *
 * This makes the world as wide as the canvas plus the whole padding difference, so `center` can
 * stay in the middle of the padded area (where the world view has always put it) with the world
 * still reaching both edges of the map. Half that zoom would do if the centre moved east instead,
 * but then the list would cover North America on screens under 1200px. Should the centre asked
 * for leave an edge open anyway, the longitude moves just enough to fill it. The latitude is
 * passed through for Mapbox to clamp, as before.
 *
 * Only the sides are handled. On a phone the sheet makes the padding lopsided top to bottom too,
 * which leaves a blank band low on the map. It shows only with the sheet pulled down to its peek,
 * and curing it would zoom the phone's world view in by about a fifth.
 */
export const worldViewCamera = (
  size: { width: number; height: number },
  padding: PaddingOptions,
  center: [number, number],
): { center: [number, number]; zoom: number } => {
  const { width, height } = size

  // Nothing to measure (a hidden map): leave the clamp to Mapbox, as before.
  if (width <= 0 || height <= 0) return { center, zoom: 0 }

  // How far right of the canvas centre the padded centre sits (left of it when negative).
  const shift = ((padding.left ?? 0) - (padding.right ?? 0)) / 2
  // The whole difference (twice the shift), and one px spare so the edge is never a sub-pixel short.
  const worldPx = Math.max(width + (shift ? Math.abs(shift) * 2 + 1 : 0), height)
  const paddedCentre = width / 2 + shift
  // `edge` is where the world's left edge lands on screen. With no blank edge it is at or left of
  // the map's left edge, and the world reaches the right one. Mapbox's clamp (the camera centre
  // half a canvas inside the world) allows only `[shift + width - worldPx, shift]`.
  const lowest = Math.max(width - worldPx, shift + width - worldPx)
  const highest = Math.min(0, shift)
  const wanted = paddedCentre - ((center[0] + 180) / 360) * worldPx
  const edge = Math.min(highest, Math.max(lowest, wanted))
  const longitude = ((paddedCentre - edge) / worldPx) * 360 - 180

  return {
    center: [longitude, center[1]],
    zoom: Math.log2(worldPx / WORLD_PX_AT_ZOOM_0),
  }
}

/**
 * The bottom inset a phone sheet takes from the camera: the sheet's height, but never so much
 * that less than `minStripPx` of map is left above it. Mapbox refuses a `fitBounds` whose
 * padding leaves no room, so a sheet as tall as the screen (the filters at their fullest) still
 * leaves the fit a strip to work in.
 */
export const sheetInset = (sheetPx: number, viewportHeight: number, minStripPx: number) =>
  Math.max(0, Math.min(sheetPx, viewportHeight - minStripPx))
