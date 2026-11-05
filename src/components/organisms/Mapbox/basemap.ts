import type { MapRef } from 'react-map-gl'
import type { ThemeMode } from '@/config/theme/palette'

// Paint overrides for the dark Studio basemap, applied on every style load.
//
// The dark style (`MAP_STYLES.dark` in `Map.tsx`) is a cold blue: every land,
// road and label colour sits at hue 211. Round 2 asked for the whole widget to
// feel warm, and a blue-black map under a warm sand panel fought it. So the dark
// map gets a warm base here — taupe land, deep teal-ink water, muted green parks,
// cream labels — without a second Studio style to maintain.
//
// The light style is the original bright, sunny one and is left exactly as it is:
// cream land, sky-blue water and soft green parks already match the art direction.
//
// Keyed by the dark style's own layer ids (Studio "Sahaj Atlas (Dark)"). A layer the
// style no longer carries is skipped, so a Studio edit degrades to the stock colour
// rather than an error. Values are literal colours: a Mapbox paint cannot read the
// widget's CSS variables.
const LAND = 'hsl(30, 12%, 21%)'
const LAND_RAISED = 'hsl(30, 11%, 25%)'
const WATER = 'hsl(193, 24%, 15%)'
const WATER_DEEP = 'hsl(193, 26%, 12%)'
const ROAD = 'hsl(34, 12%, 33%)'
const RAIL = 'hsl(30, 9%, 29%)'
const BORDER = 'hsl(34, 16%, 46%)'
const LABEL = 'hsl(40, 30%, 88%)'
const LABEL_SOFT = 'hsl(38, 18%, 72%)'
const LABEL_WATER = 'hsl(190, 18%, 58%)'
const HALO = 'hsl(30, 14%, 15%)'

type Paint = Record<string, unknown>

export const DARK_WARM_PAINT: Readonly<Record<string, Paint>> = {
  land: { 'background-color': LAND },
  'national-park': { 'fill-color': 'hsl(105, 15%, 27%)' },
  landuse: {
    'fill-color': [
      'match',
      ['get', 'class'],
      'wood',
      'hsla(100, 14%, 29%, 0.8)',
      'scrub',
      'hsla(95, 12%, 29%, 0.6)',
      'agriculture',
      'hsla(80, 12%, 28%, 0.6)',
      'park',
      'hsl(105, 16%, 28%)',
      'grass',
      'hsla(95, 14%, 30%, 0.6)',
      'cemetery',
      'hsl(100, 12%, 30%)',
      'glacier',
      'hsl(35, 8%, 38%)',
      'pitch',
      'hsl(110, 18%, 31%)',
      'sand',
      'hsl(38, 18%, 28%)',
      LAND_RAISED,
    ],
  },
  'pitch-outline': { 'line-color': 'hsl(110, 16%, 34%)' },
  'waterway-shadow': { 'line-color': WATER_DEEP },
  'water-shadow': { 'fill-color': WATER_DEEP },
  waterway: { 'line-color': WATER },
  water: { 'fill-color': WATER },
  'land-structure-polygon': { 'fill-color': LAND_RAISED },
  'land-structure-line': { 'line-color': LAND_RAISED },
  building: { 'fill-color': 'hsl(30, 10%, 27%)' },
  'tunnel-simple': { 'line-color': ROAD },
  'road-simple': { 'line-color': ROAD },
  'road-rail': { 'line-color': RAIL },
  'road-rail-tracks': { 'line-color': RAIL },
  'bridge-case-simple': { 'line-color': LAND_RAISED },
  'bridge-simple': { 'line-color': ROAD },
  'bridge-rail': { 'line-color': RAIL },
  'bridge-rail-tracks': { 'line-color': RAIL },
  'admin-1-boundary-bg': { 'line-color': HALO },
  'admin-0-boundary-bg': { 'line-color': HALO },
  'admin-1-boundary': { 'line-color': BORDER },
  'admin-0-boundary': { 'line-color': BORDER },
  'admin-0-boundary-disputed': { 'line-color': BORDER },
  'road-label-simple': { 'text-color': LABEL_SOFT, 'text-halo-color': HALO },
  'waterway-label': { 'text-color': LABEL_WATER, 'text-halo-color': HALO },
  'natural-line-label': { 'text-color': LABEL_SOFT, 'text-halo-color': HALO },
  'natural-point-label': { 'text-color': LABEL_SOFT, 'text-halo-color': HALO },
  'water-line-label': { 'text-color': LABEL_WATER, 'text-halo-color': HALO },
  'water-point-label': { 'text-color': LABEL_WATER, 'text-halo-color': HALO },
  'poi-label': { 'text-color': LABEL_SOFT, 'text-halo-color': HALO },
  'transit-label': { 'text-color': LABEL_SOFT, 'text-halo-color': HALO },
  'settlement-minor-label': { 'text-color': LABEL, 'text-halo-color': HALO },
  'settlement-major-label': { 'text-color': LABEL, 'text-halo-color': HALO },
  'state-label': { 'text-color': LABEL, 'text-halo-color': HALO },
  'country-label': { 'text-color': LABEL, 'text-halo-color': HALO },
}

/**
 * Warm the dark basemap, and keep it warm across style loads.
 *
 * A light/dark switch swaps the whole style, which drops every paint override, so
 * this re-applies on each `style.load`. In light mode it does nothing. Returns an
 * unsubscribe.
 */
export function warmBasemap(map: MapRef, mode: ThemeMode): () => void {
  if (mode !== 'dark') return () => {}

  // `MapRef` proxies only part of the mapbox-gl API, and `setPaintProperty` is not in
  // it, so the overrides go to the underlying map.
  const gl = map.getMap()
  const apply = () => {
    for (const [layer, paint] of Object.entries(DARK_WARM_PAINT)) {
      if (!gl.getLayer(layer)) continue
      for (const [property, value] of Object.entries(paint)) {
        try {
          // @ts-expect-error — the property name is a runtime key of the table above.
          gl.setPaintProperty(layer, property, value)
        } catch (error) {
          // A cosmetic override must never take the map down.
          console.error(`Failed to warm basemap layer "${layer}"`, error)
        }
      }
    }
  }

  map.on('style.load', apply)
  // A recycled map (`reuseMaps`) can arrive with the dark style already loaded, so
  // nothing would fire. A style still loading reports false and waits for the event.
  if (map.isStyleLoaded()) apply()

  return () => {
    map.off('style.load', apply)
  }
}
