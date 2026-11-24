import type { MapRef } from 'react-map-gl/mapbox'

import {
  buildPalette,
  DEFAULT_SEEDS,
  HOVER_STEP,
  scaleHex,
  seedOrDefault,
  shiftHex,
  SOLID_STEP,
  type PaletteRoles,
  type ThemeMode,
} from '@/config/theme/palette'

// These are app-owned marker images, registered on the map at runtime.
//
// The pins used to come from each Mapbox Studio style's sprite, and the two
// styles had drifted. The dark style only ever got `cluster` and a
// `selected` that is really the ROUND cluster art. It had no teardrop
// `point` and no `cluster-selected` at all. So in dark mode a single,
// unclustered event rendered as nothing, and the selected and hovered area
// highlight was missing too. Owning the four marker images here fixes that
// at the source, and keeps the two themes identical — the map's own
// iconography stops depending on whichever sprite a Studio style happens
// to carry.
//
// Names are `sy-`-prefixed, so they can never collide with a style sprite.

// A pin, and the vague-place ring and dot (`layers.ts`), carry a fixed edge for
// the style they are drawn on, so the brand colour is never measured against the
// basemap. A bubble carries its own translucent ring instead (below).
//
// Measured once from each Studio style's own JSON — the two ids are in
// `Map.tsx`'s `MAP_STYLES`. Light `ck7g6nag70rn11io09f45odkq`: land `#f3ead8`,
// water `#78bced`. Dark `cl4nw934f001j14l8jnof3a7w`: land `#5a8bbf`, water
// `#33567a`.
//
// ⚠ **Dark edge on the light map, pale edge on the dark one — the opposite of
// intuition.** The dark style is mid-toned and its land is LIGHTER than its
// water, so black reaches only 2.74:1 on that water while white reaches 1.20:1
// on the light style's land. Do not swap them to match the names.
export const MARKER_OUTLINE: Record<ThemeMode, string> = {
  light: '#000000',
  dark: '#ffffff',
}

/** The basemap colours each outline is measured against (`markers.outline.test.ts`). */
export const BASEMAP_SURFACES: Record<ThemeMode, { land: string; water: string }> = {
  light: { land: '#f3ead8', water: '#78bced' },
  dark: { land: '#5a8bbf', water: '#33567a' },
}

// The pin's edge: thin enough to read as an edge rather than a second colour. The
// canvas clips the outer 0.1–0.2 units at the head's left edge and the tip, where
// the pin meets the map anyway.
const OUTLINE_WIDTH = 1.2

const RING_OPACITY = 0.706

// The map's marks take their colours from the LIGHT-mode palette in both modes.
// The dark basemap is mid-toned and washed out, so a dark-mode solid — lifted to
// read on the near-black panel — washes out on it too.
const MARKER_MODE: ThemeMode = 'light'

// Each image is rasterised at the size it is shown and at the screen's own pixel
// ratio, so Mapbox draws it 1:1. ⚠ Never shrink one with `icon-size` instead:
// Mapbox resamples a scaled icon from its atlas with no mipmaps, which
// stair-steps a thin edge (the pins' outline, measured at 2× and 1×).
type MarkerImage = {
  /** The bitmap's size in device pixels. */
  width: number
  height: number
  /** Device pixels per CSS pixel, for `addImage`, so the image shows at its logical size. */
  ratio: number
  svg: string
}

// `width` and `height` are the art's logical size, which its viewBox keeps;
// `size` is how large it shows, relative to that.
const svg = (width: number, height: number, body: string, ratio: number, size = 1): MarkerImage => {
  const pixelWidth = Math.round(width * size * ratio)
  const pixelHeight = Math.round(height * size * ratio)

  return {
    width: pixelWidth,
    height: pixelHeight,
    ratio,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="${pixelHeight}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
  }
}

// This is the teardrop pin: a 15px-radius head centered at (15.5, 16), with
// tangent sides converging on the tip at (15.5, 37.6), a white center dot,
// and the soft drop shadow the Studio sprite included. The tip sits on the
// image's bottom edge, which is what `icon-anchor: 'bottom'` pins to the
// coordinate. So the viewport cannot grow downward. The shadow's offset and
// blur are sized to land inside 34×38, rather than being squared off by the
// edge. The last of it falls under the tip, where the pin meets the map
// anyway.
/** The teardrop pin's art width, in its own units. */
export const PIN_WIDTH = 34
/** How large a pin shows, relative to its art: `PIN_WIDTH × PIN_SIZE` CSS px wide. */
export const PIN_SIZE = 0.85

const pin = (fill: string, outline: string, ratio: number): MarkerImage =>
  svg(
    PIN_WIDTH,
    38,
    `<defs>
    <filter id="shadow" x="-40%" y="-40%" width="200%" height="200%">
      <feDropShadow dx="1.2" dy="0.8" stdDeviation="0.9" flood-color="#4A5350" flood-opacity="0.45"/>
    </filter>
  </defs>
  <path d="M4.71 26.42a15 15 0 1 1 21.58 0L15.5 37.6Z" fill="${fill}" filter="url(#shadow)" stroke="${outline}" stroke-width="${OUTLINE_WIDTH}" stroke-linejoin="round"/>
  <circle cx="15.5" cy="16" r="4.5" fill="#FFFFFF"/>`,
    ratio,
    PIN_SIZE,
  )

// This is the cluster bubble: a solid disc inside a wider translucent ring.
// The count label is a `text-field` on the layer, so the art carries no
// text.
// The translucent ring is the whole edge: no outline, which clashed with it.
// The disc is opaque, so a pale feature underneath cannot thin its count.
const cluster = (fill: string, ring: string, ratio: number): MarkerImage =>
  svg(
    38,
    38,
    `<circle cx="19" cy="19" r="19" fill="${ring}" fill-opacity="${RING_OPACITY}"/>
  <circle cx="19" cy="19" r="13.8" fill="${fill}"/>`,
    ratio,
  )

/** Marker image ids — referenced by `icon-image` in `layers.ts`. */
export const MARKER_IDS = {
  point: 'sy-point',
  pointSelected: 'sy-point-selected',
  cluster: 'sy-cluster',
  clusterSelected: 'sy-cluster-selected',
} as const

/** A pin's fill. Its edge is the basemap's (`MARKER_OUTLINE`), not a brand colour. */
type PinColors = { fill: string }
/** A bubble's two colors: the disc, and the translucent ring around it. */
type BubbleColors = { fill: string; ring: string }

export type MarkerColors = Readonly<{
  [MARKER_IDS.point]: PinColors
  [MARKER_IDS.pointSelected]: PinColors
  [MARKER_IDS.cluster]: BubbleColors
  [MARKER_IDS.clusterSelected]: BubbleColors
}>

// Through `buildPalette`, not `buildScale`, so the selected pair carries
// `selected-distinct` — the check that keeps it from matching every pin around it.
//
// The pin is the ramp's solid. The cluster disc is its hovered solid, one tone
// deeper, so a circle reads as a heavier mark than a single class and carries its
// count: white at 4.7:1 on the default green, where the solid would give 3.5:1.
function deriveMarkerColors(primarySeed: string, contrastSeed: string): MarkerColors {
  const built = buildPalette({ primary: primarySeed, contrast: contrastSeed }, MARKER_MODE)
  const pair = (role: 'primary' | 'contrast'): [PinColors, BubbleColors] => {
    // Both seeds are usable (`seedOrDefault`), so `buildPalette` built both roles.
    const { scale } = built[role]!
    const fill = scaleHex(scale, SOLID_STEP)
    // A bubble's pale halo, taken from the role's solid rather than the deeper disc so
    // it stays pale. The cap keeps a light fill's ring a colour rather than white.
    const ring = shiftHex(fill, { lightness: 34, saturation: -11, maxLightness: 82 })

    return [{ fill }, { fill: scaleHex(scale, HOVER_STEP), ring }]
  }
  const [point, bubble] = pair('primary')
  const [pointSelected, bubbleSelected] = pair('contrast')

  return {
    [MARKER_IDS.point]: point,
    [MARKER_IDS.pointSelected]: pointSelected,
    [MARKER_IDS.cluster]: bubble,
    [MARKER_IDS.clusterSelected]: bubbleSelected,
  }
}

/** What an embed with no tenant seed renders: `DEFAULT_SEEDS`, by a tenant's own rules. */
export const DEFAULT_MARKER_COLORS: MarkerColors = deriveMarkerColors(
  DEFAULT_SEEDS.primary,
  DEFAULT_SEEDS.contrast,
)

/**
 * The four images' colors for a resolved palette, the same in both modes
 * (`MARKER_MODE`).
 *
 * Pure, and the only thing in this module that is: `markers.ts` must stay
 * importable with no DOM, and the node lane asserts these values.
 *
 * A role with no usable seed takes its `DEFAULT_SEEDS` entry, per role rather
 * than per palette, and goes through the same rules as a tenant's.
 */
export function markerColors(palette: PaletteRoles): MarkerColors {
  const primary = seedOrDefault('primary', palette.primary)
  const contrast = seedOrDefault('contrast', palette.contrast)

  // ⚠ The same object, not an equal one. `Map.tsx` memoises this and the
  // registration effect depends on it, so a new identity costs an unbranded
  // embed a re-subscription and four rebuilt SVGs.
  if (primary === DEFAULT_SEEDS.primary && contrast === DEFAULT_SEEDS.contrast) {
    return DEFAULT_MARKER_COLORS
  }

  return deriveMarkerColors(primary, contrast)
}

/**
 * The four marker images in the given colors, with the pins edged for `mode`'s
 * basemap, rasterised at `ratio` device pixels per CSS pixel.
 *
 * This is a Map, not an object literal. The `styleimagemissing` event carries
 * whatever `icon-image` asked for, including the basemap's own layers. An id
 * like `constructor` would resolve up an object's prototype chain to a
 * non-marker.
 */
export function markerImages(
  colors: MarkerColors,
  mode: ThemeMode,
  ratio: number,
): Map<string, MarkerImage> {
  const { point, cluster: bubble, clusterSelected, pointSelected } = MARKER_IDS
  const edge = MARKER_OUTLINE[mode]

  return new Map<string, MarkerImage>([
    [point, pin(colors[point].fill, edge, ratio)],
    [pointSelected, pin(colors[pointSelected].fill, edge, ratio)],
    [bubble, cluster(colors[bubble].fill, colors[bubble].ring, ratio)],
    [clusterSelected, cluster(colors[clusterSelected].fill, colors[clusterSelected].ring, ratio)],
  ])
}

// Every cache below is keyed by this, not by the image id alone: a palette
// change and a light/dark flip both produce different art for the same id. The
// SVG string IS the art, so this cannot miss a difference and needs no separate
// list of the colors that went into it.
//
// The pins' edge is per basemap, so at most one entry per image per mode survives
// an ordinary visit — eight per embed — and none of them needs eviction.
//
// shortcut: an embed's first switch into a mode decodes that mode's pins, so they
// land a tick after the new style's first frame rather than on it. Measure before
// warming the other mode at mount, which costs every visitor the decodes.
//
// shortcut: a `clients` preview session repaints per colour-picker message, and
// each new palette retains four more bitmaps for the life of that tab — about
// 86 KB a palette, in one manager's own admin iframe. Evict least-recently-used
// once a session is measured holding more than a few megabytes, or once anything
// but a preview changes the palette continuously.
const artKey = (id: string, { svg }: MarkerImage) => `${id}|${svg}`

// Each id is decoded once and kept. `addImage` extracts the pixels, so one
// decoded element can be re-added as often as needed. This matters, because
// a style switch (light to dark, or back) drops every runtime image and
// re-fires `styleimagemissing`. With the cache warm, the images return
// SYNCHRONOUSLY inside the event, so the new style's first frame already
// has its pins — a microtask would already be too late. This is
// module-level, not per map, so a remount is warm too. Nothing touches
// `Image` until `registerMarkerImages` runs, which keeps this import safe
// in the node lane.
const decoded = new Map<string, HTMLImageElement>()
// This tracks in-flight decodes, so the cold start pays for each image
// ONCE. Mapbox re-fires `styleimagemissing` per missing id per tile batch.
// None of those repeats see a `decoded` entry until the first decode
// resolves. Without this map, each repeat would start its own decode.
const decoding = new Map<string, Promise<HTMLImageElement>>()
// These are images whose decode failed, so this stops retrying until the next
// style load. A failed decode is removed from `decoding` — a rejected
// promise left in place would poison the image for the life of the page. Since
// the widget owns ALL four images, a host whose CSP omits `img-src data:`
// would then lose every pin permanently. But retrying on that fact alone
// would loop: `styleimagemissing` re-fires per missing id PER TILE BATCH, so
// a blocked `data:` URI would rebuild four `Image`s and log four errors
// every batch, forever. This allows one attempt per id per style load
// instead.
const failed = new Set<string>()

/** Rasterise one marker SVG via an inline data URI (no network). */
function decodeMarker(key: string, { svg, width, height }: MarkerImage) {
  const pending = decoding.get(key)

  if (pending) return pending

  const image = new Image(width, height)

  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

  const decode = image.decode().then(() => {
    decoded.set(key, image)

    return image
  })

  decode.catch(() => {
    decoding.delete(key)
    failed.add(key)
  })
  decoding.set(key, decode)

  return decode
}

/**
 * Register the marker images with a map, and keep them registered.
 *
 * `styleimagemissing` is Mapbox's own hook for supplying an icon a style
 * lacks. It re-fires after every style load, which covers the initial load and
 * the style a light/dark switch swaps in. The pins' edge follows `mode`, so
 * `Map.tsx` re-subscribes on a switch as it does on a palette change. This
 * function returns an unsubscribe.
 *
 * `colors` repaints a live map in place. Call this again with a new set — the
 * effect in `Map.tsx` does, since the set is one of its dependencies — and
 * each image whose colors changed is removed and added again.
 */
export function registerMarkerImages(
  map: MapRef,
  colors: MarkerColors,
  mode: ThemeMode,
): () => void {
  // shortcut: read once per subscription, so a window dragged to a screen with
  // another pixel ratio keeps the old bitmaps, scaled, until the next palette or
  // theme change. Listen for the ratio's own media query if that is ever seen.
  const ratio = window.devicePixelRatio || 1
  const images = markerImages(colors, mode, ratio)
  // What this subscription has already put on the map. Mapbox re-fires
  // `styleimagemissing` per missing id PER TILE BATCH, and without this each
  // repeat would replace the image again. It needs no color of its own: the
  // colors are fixed for the life of one subscription, and a style load dropping
  // the image underneath is what `map.hasImage` beside it answers.
  const registered = new Map<string, string>()
  // The unsubscribe sets this. A decode that resolves after the map is gone
  // must not touch it. `hasImage` short-circuits on a removed map's missing
  // style, so the `addImage` behind it would have Mapbox lazily build a
  // fresh Style and a worker dispatcher for a dead map. This is benign
  // today only because `Map.tsx` passes `reuseMaps` — react-map-gl recycles
  // instead of removing. This module should not depend on that guarantee.
  let cancelled = false

  // A missing marker is cosmetic. This must never crash the map's tree, and
  // it runs synchronously inside an effect or a Mapbox event.
  const onError = (id: string) => (error: unknown) =>
    console.error(`Failed to add map marker "${id}"`, error)

  // An id the style already carries is removed first: a second `addImage` on a
  // live id makes Mapbox fire an `error` event.
  // ⚠ Not `updateImage`. It leaves the icon-atlas patch for a later frame, and a
  // frame that re-evaluates the style first discards it. A palette change starts
  // the cluster count's paint transition, which is exactly that, so the pins kept
  // their old colors (seen in a browser, mapbox-gl 3.34.1). `removeImage` makes
  // Mapbox re-lay out the symbol tiles instead, once per palette change.
  const place = (id: string, key: string, image: HTMLImageElement) => {
    // Both call sites below can run synchronously, so this guards rather than
    // leaving it to the decode path's `.catch`.
    try {
      if (map.hasImage(id)) map.removeImage(id)
      map.addImage(id, image, { pixelRatio: ratio })

      registered.set(id, key)
    } catch (error) {
      onError(id)(error)
    }
  }

  // Already on the map in these colors. A style load drops the image without
  // telling this module, so the id's presence is checked too.
  const current = (id: string, key: string) => registered.get(id) === key && map.hasImage(id)

  const add = (id: string) => {
    const marker = images.get(id)

    if (!marker) return

    const key = artKey(id, marker)

    if (failed.has(key) || current(id, key)) return

    const cached = decoded.get(key)

    if (cached) return place(id, key, cached)

    decodeMarker(key, marker)
      // Two things can have happened while the SVG decoded, and each needs its
      // own answer. The style, the palette or the mode changing re-runs the
      // effect, which unsubscribes this closure first — `cancelled` keeps a
      // stale decode from painting over the colors that replaced it. And
      // Mapbox re-fires `styleimagemissing` PER TILE BATCH, so several repeats
      // queue on this one promise; without re-asking `current`, each would be
      // another texture upload of art already on the map.
      .then((image) => {
        if (!cancelled && !current(id, key)) place(id, key, image)
      })
      .catch(onError(id))
  }
  const onMissing = (event: { id: string }) => add(event.id)
  // A new style is the one sensible moment to retry a failed decode. This is
  // when the images are wanted again anyway, and it bounds retries at one
  // per id per style.
  const onStyleLoad = () => failed.clear()

  map.on('styleimagemissing', onMissing)
  map.on('style.load', onStyleLoad)
  // This starts the decodes now, rather than waiting for the first tile
  // batch to ask. react-map-gl provides the map right after constructing
  // it — BEFORE the style has loaded — so this eager pass usually only
  // warms the cache. `styleimagemissing` is what actually lands the images.
  // This is harmless either way: `add` no-ops on an image the style already
  // has in these colors.
  //
  // It is also what repaints a live map. A palette change re-runs the effect
  // rather than reloading the style, so nothing re-fires
  // `styleimagemissing` — this pass is the only thing that asks again.
  images.forEach((_marker, id) => add(id))

  return () => {
    cancelled = true
    map.off('styleimagemissing', onMissing)
    map.off('style.load', onStyleLoad)
  }
}
