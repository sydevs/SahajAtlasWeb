import type { MapRef } from 'react-map-gl'

import {
  shiftHex,
  SOLID_STEP,
  stepHex,
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

// These are the Studio artwork's colors, kept verbatim: a teal pin and cluster
// for a normal event, the warm accent for the selected one.
//
// ⚠ These are what an embed with no tenant seed renders, in BOTH modes, and
// `markerColors` below must keep returning them unchanged for that case.
// Deriving them from `DEFAULT_SEEDS` instead would change the unbranded pin:
// `DEFAULT_SEEDS.primary`'s step 9 is hsl(184 58% 28%), 16pp darker and 16°
// bluer than the teal below, and hsl(184 58% 60%) in dark mode — while this
// pin is identical in both. `applyPalette` makes the same promise for the CSS
// variables: with no palette supplied, none of the derivation runs.
const POINT_FILL = '#21C1A2'
const POINT_SELECTED_FILL = '#E87952'
const CLUSTER_FILL = '#37BB92'
const CLUSTER_RING = '#8CCDC4'
const CLUSTER_SELECTED_FILL = '#E47C5A'
const CLUSTER_SELECTED_RING = '#F2A179'

// Rasterisation scale — the images are drawn at 2× and registered with
// `pixelRatio: 2`, matching the @2x Studio sprite they replace.
const SCALE = 2

type MarkerImage = {
  /** This is the logical (CSS px) size. The bitmap is `SCALE`× this size. */
  width: number
  height: number
  svg: string
}

// This builds one `<svg>` at `SCALE`× its logical size — the size Mapbox
// reads from the decoded element. It is declared once here, rather than
// once per shape.
const svg = (width: number, height: number, body: string): MarkerImage => ({
  width,
  height,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width * SCALE}" height="${height * SCALE}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
})

// This is the teardrop pin: a 15px-radius head centered at (15.5, 16), with
// tangent sides converging on the tip at (15.5, 37.6), a white center dot,
// and the soft drop shadow the Studio sprite included. The tip sits on the
// image's bottom edge, which is what `icon-anchor: 'bottom'` pins to the
// coordinate. So the viewport cannot grow downward. The shadow's offset and
// blur are sized to land inside 34×38, rather than being squared off by the
// edge. The last of it falls under the tip, where the pin meets the map
// anyway.
const pin = (fill: string): MarkerImage =>
  svg(
    34,
    38,
    `<defs>
    <filter id="shadow" x="-40%" y="-40%" width="200%" height="200%">
      <feDropShadow dx="1.2" dy="0.8" stdDeviation="0.9" flood-color="#4A5350" flood-opacity="0.45"/>
    </filter>
  </defs>
  <path d="M4.71 26.42a15 15 0 1 1 21.58 0L15.5 37.6Z" fill="${fill}" filter="url(#shadow)"/>
  <circle cx="15.5" cy="16" r="4.5" fill="#FFFFFF"/>`,
  )

// This is the cluster bubble: a solid disc inside a wider translucent ring.
// The count label is a `text-field` on the layer, so the art carries no
// text.
const cluster = (fill: string, ring: string): MarkerImage =>
  svg(
    38,
    38,
    `<circle cx="19" cy="19" r="19" fill="${ring}" opacity="0.706"/>
  <circle cx="19" cy="19" r="13.8" fill="${fill}" opacity="0.914"/>`,
  )

/** Marker image ids — referenced by `icon-image` in `layers.ts`. */
export const MARKER_IDS = {
  point: 'sy-point',
  pointSelected: 'sy-point-selected',
  cluster: 'sy-cluster',
  clusterSelected: 'sy-cluster-selected',
} as const

type PinColors = { fill: string }

/** A cluster bubble's two colors: the solid disc, and the wider translucent ring. */
type ClusterColors = { fill: string; ring: string }

export type MarkerColors = Readonly<{
  [MARKER_IDS.point]: PinColors
  [MARKER_IDS.pointSelected]: PinColors
  [MARKER_IDS.cluster]: ClusterColors
  [MARKER_IDS.clusterSelected]: ClusterColors
}>

/** What an embed with no tenant seed renders. */
export const DEFAULT_MARKER_COLORS: MarkerColors = {
  [MARKER_IDS.point]: { fill: POINT_FILL },
  [MARKER_IDS.pointSelected]: { fill: POINT_SELECTED_FILL },
  [MARKER_IDS.cluster]: { fill: CLUSTER_FILL, ring: CLUSTER_RING },
  [MARKER_IDS.clusterSelected]: { fill: CLUSTER_SELECTED_FILL, ring: CLUSTER_SELECTED_RING },
}

// The Studio art's own two fill→ring deltas disagree — +21 L / −16 S for the
// unclustered pair, +9 / +9 for the selected one — so one transform replaces
// both rather than preserving a difference nobody chose.
const ringOf = (fill: string) =>
  shiftHex(fill, { lightness: 21, saturation: -16, maxLightness: 92 })

/**
 * The four images' colors for a resolved palette, in the active mode.
 *
 * Pure, and the only thing in this module that is: `markers.ts` must stay
 * importable with no DOM, and the node lane asserts these values.
 *
 * A role with no usable seed keeps its default verbatim, per role rather than
 * per palette — a tenant that configured `color1` alone still gets its own
 * pins and the stock selected accent.
 */
export function markerColors(palette: PaletteRoles, mode: ThemeMode): MarkerColors {
  const primary = stepHex(palette.primary, mode, SOLID_STEP)
  const contrast = stepHex(palette.contrast, mode, SOLID_STEP)

  // ⚠ The same object, not an equal one. `Map.tsx` memoises this and the
  // registration effect depends on it, so a new identity costs an unbranded
  // embed a re-subscription and four rebuilt SVGs on every light/dark flip —
  // where before this file carried colors, a flip ran nothing here at all.
  if (!primary && !contrast) return DEFAULT_MARKER_COLORS

  return {
    [MARKER_IDS.point]: primary ? { fill: primary } : DEFAULT_MARKER_COLORS[MARKER_IDS.point],
    [MARKER_IDS.pointSelected]: contrast
      ? { fill: contrast }
      : DEFAULT_MARKER_COLORS[MARKER_IDS.pointSelected],
    [MARKER_IDS.cluster]: primary
      ? { fill: primary, ring: ringOf(primary) }
      : DEFAULT_MARKER_COLORS[MARKER_IDS.cluster],
    [MARKER_IDS.clusterSelected]: contrast
      ? { fill: contrast, ring: ringOf(contrast) }
      : DEFAULT_MARKER_COLORS[MARKER_IDS.clusterSelected],
  }
}

/**
 * The four marker images in the given colors.
 *
 * This is a Map, not an object literal. The `styleimagemissing` event carries
 * whatever `icon-image` asked for, including the basemap's own layers. An id
 * like `constructor` would resolve up an object's prototype chain to a
 * non-marker.
 */
export function markerImages(colors: MarkerColors): Map<string, MarkerImage> {
  const { point, cluster: bubble, clusterSelected, pointSelected } = MARKER_IDS

  return new Map<string, MarkerImage>([
    [point, pin(colors[point].fill)],
    [pointSelected, pin(colors[pointSelected].fill)],
    [bubble, cluster(colors[bubble].fill, colors[bubble].ring)],
    [clusterSelected, cluster(colors[clusterSelected].fill, colors[clusterSelected].ring)],
  ])
}

// Every cache below is keyed by this, not by the image id alone: a palette
// change and a light/dark flip both produce different art for the same id. The
// SVG string IS the art, so this cannot miss a difference and needs no separate
// list of the colors that went into it.
//
// At most one entry per image per mode survives a session — eight per embed —
// so none of them needs eviction. An unseeded role derives nothing, so its art
// is identical in both modes and takes ONE entry: the stock pins stay warm
// across a theme switch exactly as they did before colors existed here.
//
// shortcut: a branded embed's first switch into a mode decodes that mode's four
// images, so those pins land a tick after the new style's first frame rather
// than on it. Measure before warming the counterpart mode at mount — that trades
// four rasterisations and four texture uploads at boot for a mode the visitor
// may never ask for.
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

/** Rasterise one marker SVG at `SCALE`× via an inline data URI (no network). */
function decodeMarker(key: string, { svg, width, height }: MarkerImage) {
  const pending = decoding.get(key)

  if (pending) return pending

  const image = new Image(width * SCALE, height * SCALE)

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
 * lacks. It re-fires after every style load. So this one subscription
 * covers both the initial load AND the light/dark switch, which swaps the
 * style and drops runtime images, without tracking the theme here. This
 * function returns an unsubscribe.
 *
 * `colors` repaints a live map in place. Call this again with a new set — the
 * effect in `Map.tsx` does, since the set is one of its dependencies — and
 * each image whose colors changed is removed and added again.
 */
export function registerMarkerImages(map: MapRef, colors: MarkerColors): () => void {
  const images = markerImages(colors)
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
      map.addImage(id, image, { pixelRatio: SCALE })

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
