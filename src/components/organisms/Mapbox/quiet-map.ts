import type { MapRef } from 'react-map-gl'
import type { ThemeMode } from '@/config/theme/palette'

// A prototype of a calmer basemap, painted over the two Mapbox Studio styles at runtime.
//
// The sea and land cover most of the screen, so whatever they are is the product's real
// colour. In the Studio styles that is sky blue on the light map, and on the dark one a land
// brighter than its own sea. The lasting fix is to change those styles in Studio. This module
// shows the look without touching them, and can be deleted once Studio carries the same values.
//
// The colours are basemap colours, not brand colours, so a tenant's palette does not repaint
// them. They stay neutral enough to sit under any tenant's pins.

type BasemapPalette = {
  land: string
  water: string
  park: string
  /** Fields, scrub and grass: one quiet step off the land. */
  green: string
  /** Paved areas, buildings and airports. */
  structure: string
  road: string
  /** Faint boundary and tunnel lines. */
  boundary: string
  label: string
  labelQuiet: string
  labelHalo: string
  waterLabel: string
}

export const BASEMAP_PALETTES: Record<ThemeMode, BasemapPalette> = {
  light: {
    land: '#F6F4EF',
    water: '#CFDFE2',
    park: '#E6EBDD',
    green: '#EEEFE5',
    structure: '#ECE9E2',
    road: '#FFFFFF',
    boundary: '#CFCBC2',
    label: '#2F3A3D',
    labelQuiet: '#5C676A',
    labelHalo: '#FBFAF7',
    waterLabel: '#5F7C82',
  },
  dark: {
    land: '#20272A',
    water: '#12171A',
    park: '#232E2C',
    green: '#222A2B',
    structure: '#262E31',
    road: '#303A3E',
    boundary: '#3D484C',
    label: '#D5DCDE',
    labelQuiet: '#9BA7AB',
    labelHalo: '#12171A',
    waterLabel: '#6F8A90',
  },
}

type PaintEntry = [layer: string, property: string, value: unknown]

/** Every paint override for one theme. The two styles' layers differ, so `apply` skips absent ids. */
export function basemapPaint(theme: ThemeMode): PaintEntry[] {
  const c = BASEMAP_PALETTES[theme]
  const lines = (color: string, ...ids: string[]): PaintEntry[] =>
    ids.map((id) => [id, 'line-color', color])
  const fills = (color: string, ...ids: string[]): PaintEntry[] =>
    ids.map((id) => [id, 'fill-color', color])
  const text = (color: string, ...ids: string[]): PaintEntry[] =>
    ids.flatMap((id): PaintEntry[] => [
      [id, 'text-color', color],
      [id, 'text-halo-color', c.labelHalo],
    ])

  return [
    ['land', 'background-color', c.land],
    ...fills(c.water, 'water', 'water-shadow'),
    ...lines(c.water, 'waterway', 'waterway-shadow'),
    ...fills(c.park, 'national-park'),
    [
      'landuse',
      'fill-color',
      [
        'match',
        ['get', 'class'],
        ['park', 'wood', 'cemetery', 'pitch'],
        c.park,
        ['scrub', 'grass', 'agriculture'],
        c.green,
        c.land,
      ],
    ],
    ...lines(c.green, 'pitch-outline'),
    ...fills(c.structure, 'land-structure-polygon', 'aeroway-polygon', 'building'),
    ...lines(c.structure, 'land-structure-line', 'aeroway-line', 'bridge-case-simple'),
    ...lines(
      c.road,
      'road-path',
      'road-steps',
      'road-pedestrian',
      'road-simple',
      'bridge-path',
      'bridge-steps',
      'bridge-pedestrian',
      'bridge-simple',
    ),
    ...lines(
      c.boundary,
      'tunnel-path',
      'tunnel-steps',
      'tunnel-pedestrian',
      'tunnel-simple',
      'road-rail',
      'road-rail-tracks',
      'bridge-rail',
      'bridge-rail-tracks',
      'admin-1-boundary',
      'admin-0-boundary',
      'admin-0-boundary-disputed',
    ),
    ...lines(c.land, 'admin-1-boundary-bg', 'admin-0-boundary-bg'),
    ...text(c.label, 'country-label', 'settlement-major-label', 'settlement-minor-label'),
    ...text(
      c.labelQuiet,
      'state-label',
      'settlement-subdivision-label',
      'road-label-simple',
      'natural-line-label',
      'natural-point-label',
      'poi-label',
      'transit-label',
    ),
    ...text(c.waterLabel, 'waterway-label', 'water-line-label', 'water-point-label'),
    // The town dots are the last hard marks left on the map, once the rest is muted.
    ['settlement-major-label', 'icon-opacity', 0],
    ['settlement-minor-label', 'icon-opacity', 0],
  ]
}

function applyBasemap(map: MapRef, theme: ThemeMode) {
  for (const [layer, property, value] of basemapPaint(theme)) {
    if (!map.getLayer(layer)) continue

    // Mapbox types each property name; these come from the table above, so a loose call is fine.
    const target = map.getMap() as unknown as {
      setPaintProperty: (layer: string, property: string, value: unknown) => void
    }

    // A paint change otherwise fades over the style's 300ms default, which would show the
    // Studio colours for a moment on every load.
    target.setPaintProperty(layer, `${property}-transition`, { duration: 0, delay: 0 })
    target.setPaintProperty(layer, property, value)
  }
}

/**
 * Paints the calm palette on the current style and again whenever a new style loads. react-map-gl
 * provides the map before its style has loaded, and a theme switch swaps the style underneath it.
 */
export function registerBasemap(map: MapRef, theme: ThemeMode): () => void {
  const paint = () => applyBasemap(map, theme)

  map.on('style.load', paint)
  paint()

  return () => {
    map.off('style.load', paint)
  }
}
