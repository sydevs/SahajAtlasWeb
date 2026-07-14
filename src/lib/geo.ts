import type { BBox, FeatureCollection, Point, Position } from 'geojson'

import { bbox } from '@turf/bbox'
import { circle } from '@turf/circle'
import { distance } from '@turf/distance'

/**
 * Geometry helpers for the map: deriving region geometry from the GeoJSON event
 * feed, plus framing a point that carries no bounds of its own.
 *
 * SahajCloud regions resolved from Mapbox carry no stored lat/lng/bounds (those
 * fields are only set for manually-entered locations), so the map's bounding
 * boxes and centers are computed here from the event points that fall under each
 * region. Uses `@turf/*` for the math — never hand-rolled lat/lng arithmetic.
 */

/**
 * Bounding box `[west, south, east, north]` of a set of `[lng, lat]` points, or
 * `null` when the set is empty (e.g. a region whose events are all online).
 */
export const boundsOfPoints = (points: Position[]): BBox | null => {
  if (points.length === 0) return null

  const collection: FeatureCollection<Point> = {
    type: 'FeatureCollection',
    features: points.map((coordinates) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates },
      properties: {},
    })),
  }

  return bbox(collection)
}

/** Center `[longitude, latitude]` of a bounding box. */
export const centerOfBounds = (b: BBox): Position => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]

/** Great-circle distance in kilometres between two `[longitude, latitude]` points. */
export const distanceKm = (from: Position, to: Position): number =>
  distance(from, to, { units: 'kilometers' })

/**
 * Approximate bounding box `[west, south, east, north]` of `radiusKm` around a
 * `[longitude, latitude]` point — a synthesized city-sized area for framing a
 * point that carries no real bounds (e.g. an IP-geolocation guess), so the map
 * fits a neighbourhood rather than zooming to a pinpoint.
 */
export const approxBounds = (center: Position, radiusKm: number): BBox =>
  bbox(circle(center, radiusKm, { units: 'kilometers' }))
