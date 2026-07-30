import type { MapRef } from 'react-map-gl'

// App-owned marker images, registered on the map at runtime.
//
// The pins used to come from each Mapbox Studio style's sprite, and the two
// styles had drifted: the dark style only ever got `cluster` + a `selected`
// that is really the ROUND cluster art, and has no teardrop `point` and no
// `cluster-selected` at all. So in dark mode a single (unclustered) event
// rendered as nothing, and the selected/hovered area highlight was missing
// too. Owning the four marker images here fixes that at the source and keeps
// the two themes identical — the map's own iconography stops depending on
// whichever sprite a Studio style happens to carry.
//
// Names are `sy-`-prefixed so they can never collide with a style sprite.

// The Studio artwork's colours, kept verbatim so light mode is unchanged: a
// teal pin/cluster for a normal event, the warm accent for the selected one.
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
  /** Logical (CSS px) size; the bitmap is `SCALE`× this. */
  width: number
  height: number
  svg: string
}

// One `<svg>` at `SCALE`× its logical size — the size Mapbox reads back off the
// decoded element, so it's declared once here rather than per shape.
const svg = (width: number, height: number, body: string): MarkerImage => ({
  width,
  height,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width * SCALE}" height="${height * SCALE}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
})

// The teardrop pin: a 15px-radius head centred at (15.5, 16) with tangent
// sides converging on the tip at (15.5, 37.6), a white centre dot, and the
// soft drop shadow the Studio sprite baked in. The tip sits on the image's
// bottom edge, which is what `icon-anchor: 'bottom'` pins to the coordinate —
// so the viewport can't grow downwards, and the shadow's offset + blur are
// sized to land inside 34×38 rather than being squared off by the edge (the
// last of it falls under the tip, where the pin meets the map anyway).
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

// The cluster bubble: a solid disc inside a wider translucent ring. The count
// label is a `text-field` on the layer, so the art carries no text.
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

// A Map, not an object literal: the `styleimagemissing` event carries whatever
// `icon-image` asked for — including the basemap's own layers — and an id like
// `constructor` would resolve up an object's prototype chain to a non-marker.
const MARKER_IMAGES = new Map<string, MarkerImage>([
  [MARKER_IDS.point, pin(POINT_FILL)],
  [MARKER_IDS.pointSelected, pin(POINT_SELECTED_FILL)],
  [MARKER_IDS.cluster, cluster(CLUSTER_FILL, CLUSTER_RING)],
  [MARKER_IDS.clusterSelected, cluster(CLUSTER_SELECTED_FILL, CLUSTER_SELECTED_RING)],
])

// Decoded once per id and kept: `addImage` copies the pixels out, so one decoded
// element can be re-added as often as needed. That matters because a style switch
// (light ⇄ dark) drops every runtime image and re-fires `styleimagemissing` — with
// the cache warm the images go back SYNCHRONOUSLY inside the event, so the new
// style's first frame already has its pins (a microtask is already too late).
// Module-level (not per map) so a remount is warm too; nothing touches `Image`
// until `registerMarkerImages` runs, keeping this import safe in the node lane.
const decoded = new Map<string, HTMLImageElement>()
// In-flight decodes, so the cold start pays for each image ONCE. Mapbox re-fires
// `styleimagemissing` per missing id per tile batch, and none of those repeats
// see a `decoded` entry until the first decode resolves — without this they'd
// each start their own.
const decoding = new Map<string, Promise<HTMLImageElement>>()

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

  // Drop a FAILED decode from the cache so the next style load retries it.
  // Leaving the rejected promise in place would poison the id for the life of
  // the page — and since the widget owns all four images, a host page whose CSP
  // omits `img-src data:` would then lose every pin and cluster permanently
  // rather than recovering. (Mapbox GL's own recommended CSP allows `data:`.)
  decode.catch(() => decoding.delete(id))
  decoding.set(id, decode)

  return decode
}

/**
 * Register the marker images with a map and keep them registered.
 *
 * `styleimagemissing` is Mapbox's own hook for supplying an icon a style lacks,
 * and it re-fires after every style load — so this one subscription covers the
 * initial load AND the light/dark switch (which swaps the style and drops
 * runtime images) without tracking the theme here. Returns an unsubscribe.
 */
export function registerMarkerImages(map: MapRef): () => void {
  // A missing marker is cosmetic — never take the map's tree down with it, and this
  // runs synchronously inside an effect / a Mapbox event.
  const onError = (id: string) => (error: unknown) =>
    console.error(`Failed to add map marker "${id}"`, error)

  const add = (id: string) => {
    const marker = MARKER_IMAGES.get(id)

    if (!marker || map.hasImage(id)) return

    const cached = decoded.get(id)

    if (cached) {
      // Synchronous, so it needs its own guard; the decode path below has `.catch`.
      try {
        map.addImage(id, cached, { pixelRatio: SCALE })
      } catch (error) {
        onError(id)(error)
      }

      return
    }

    decodeMarker(id, marker)
      // The style can change while the SVG decodes, so re-check before adding:
      // a duplicate id makes Mapbox fire an `error` event, which surfaces as a
      // console error rather than a throw.
      .then((image) => {
        if (!map.hasImage(id)) map.addImage(id, image, { pixelRatio: SCALE })
      })
      .catch(onError(id))
  }
  const onMissing = (event: { id: string }) => add(event.id)

  map.on('styleimagemissing', onMissing)
  // Kick the decodes now rather than waiting for the first tile batch to ask.
  // react-map-gl hands over the map right after constructing it — BEFORE the
  // style has loaded — so this eager pass usually only warms the cache, and
  // `styleimagemissing` is what actually lands the images. Harmless either way:
  // `add` no-ops on an image the style already has.
  MARKER_IMAGES.forEach((_marker, id) => add(id))

  return () => map.off('styleimagemissing', onMissing)
}
