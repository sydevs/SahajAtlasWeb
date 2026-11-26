import type { Position } from 'geojson'
import type { PickedPlace } from './place'

import { distanceKm } from '@/lib/geo'

/** How far a listed class may sit from the picked place and still lend it its zone. */
const NEAREST_ZONE_KM = 300

export type ZonedPoint = { position: Position; timeZone: string }

/**
 * The zone of the nearest listed class, when one sits close to the picked place.
 *
 * A geocoded feature carries no timezone, and the widget ships no zone table. Classes already on
 * the map do carry one, so a place within reach of another class inherits its zone. Anywhere
 * further out keeps the visitor's own zone, which the When step names so they can see it.
 */
export const nearestTimeZone = (
  place: Pick<PickedPlace, 'latitude' | 'longitude'> | null,
  points: readonly ZonedPoint[],
): string | undefined => {
  if (place?.latitude === undefined || place.longitude === undefined) return undefined

  const at: Position = [place.longitude, place.latitude]
  let best: ZonedPoint | undefined
  let bestKm = NEAREST_ZONE_KM

  for (const point of points) {
    const km = distanceKm(at, point.position)

    if (km <= bestKm) {
      best = point
      bestKm = km
    }
  }

  return best?.timeZone
}
