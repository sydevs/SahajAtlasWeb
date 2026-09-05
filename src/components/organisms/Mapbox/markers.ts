import type { MapRef } from 'react-map-gl'

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

// These are the Studio artwork's colors, kept verbatim so light mode stays
// unchanged: a teal pin and cluster for a normal event, the warm accent for
// the selected one.
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

// This is a Map, not an object literal. The `styleimagemissing` event
// carries whatever `icon-image` asked for, including the basemap's own
// layers. An id like `constructor` would resolve up an object's prototype
// chain to a non-marker.
const MARKER_IMAGES = new Map<string, MarkerImage>([
  [MARKER_IDS.point, pin(POINT_FILL)],
  [MARKER_IDS.pointSelected, pin(POINT_SELECTED_FILL)],
  [MARKER_IDS.cluster, cluster(CLUSTER_FILL, CLUSTER_RING)],
  [MARKER_IDS.clusterSelected, cluster(CLUSTER_SELECTED_FILL, CLUSTER_SELECTED_RING)],
])

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
// These are ids whose decode failed, so this stops retrying until the next
// style load. A failed decode is removed from `decoding` — a rejected
// promise left in place would poison the id for the life of the page. Since
// the widget owns ALL four images, a host whose CSP omits `img-src data:`
// would then lose every pin permanently. But retrying on that fact alone
// would loop: `styleimagemissing` re-fires per missing id PER TILE BATCH, so
// a blocked `data:` URI would rebuild four `Image`s and log four errors
// every batch, forever. This allows one attempt per id per style load
// instead.
const failed = new Set<string>()

/** Rasterise one marker SVG at `SCALE`× via an inline data URI (no network). */
function decodeMarker(id: string, { svg, width, height }: MarkerImage) {
  const pending = decoding.get(id)

  if (pending) return pending

  const image = new Image(width * SCALE, height * SCALE)

  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

  const decode = image.decode().then(() => {
    decoded.set(id, image)

    return image
  })

  decode.catch(() => {
    decoding.delete(id)
    failed.add(id)
  })
  decoding.set(id, decode)

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
 */
export function registerMarkerImages(map: MapRef): () => void {
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

  const add = (id: string) => {
    const marker = MARKER_IMAGES.get(id)

    if (!marker || failed.has(id) || map.hasImage(id)) return

    const cached = decoded.get(id)

    if (cached) {
      // This runs synchronously, so it needs its own guard. The decode path
      // below has `.catch`.
      try {
        map.addImage(id, cached, { pixelRatio: SCALE })
      } catch (error) {
        onError(id)(error)
      }

      return
    }

    decodeMarker(id, marker)
      // The style can change while the SVG decodes, so this re-checks before
      // adding. A duplicate id makes Mapbox fire an `error` event, which
      // surfaces as a console error, rather than a throw.
      .then((image) => {
        if (!cancelled && !map.hasImage(id)) map.addImage(id, image, { pixelRatio: SCALE })
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
  // has.
  MARKER_IMAGES.forEach((_marker, id) => add(id))

  return () => {
    cancelled = true
    map.off('styleimagemissing', onMissing)
    map.off('style.load', onStyleLoad)
  }
}
