import type { GeoFeature, Geojson } from '@/types'
import type { Position } from 'geojson'

import { distanceKm } from './geo'

import { byDistance, byNextOccurrence, nextOccurrence } from '@/lib/shape'

// Which classes a compact card puts in front of somebody (issue #161), derived from the
// already-cached `['geojson']` feed — the same one the map and every list read, so the card
// costs no request of its own.

/**
 * How many rows the card shows.
 *
 * Three, and the ceiling is the card rather than the taste: the compact form exists because
 * the slot is under 360×420, and a `EventListItem` runs to roughly 90px with its title, facts
 * and chips. Three rows plus the heading and the button is already the whole card.
 */
export const COMPACT_ROWS = 3

/**
 * The classes worth showing, best first.
 *
 * **Nearest when we have any idea where the viewer is, soonest otherwise**, and the fallback
 * is not a lesser version of the same list — it is a different question, honestly answered.
 * A card promising "near you" from a global feed with no location would be picking three
 * classes at random from the world; the soonest ones at least share a reason for being there.
 *
 * Events with no next occurrence are dropped outright rather than sorted last: a dormant class
 * is a row that cannot be attended, and there are only three rows.
 */
export function compactRows(
  geojson: Geojson | undefined,
  from: Position | undefined,
  limit: number = COMPACT_ROWS,
): GeoFeature[] {
  // `filter` already copies, so the sort below never touches the cached feed's own array.
  const upcoming = (geojson?.features ?? []).filter((feature) => nextOccurrence(feature.properties))

  if (!from)
    return upcoming.sort((a, b) => byNextOccurrence(a.properties, b.properties)).slice(0, limit)

  return upcoming
    .map((feature) => ({
      feature,
      // Online classes carry no geometry and so no distance; `byDistance` sorts them last
      // rather than dropping them, which is right — an online class is attendable from here.
      distance: feature.geometry ? distanceKm(from, feature.geometry.coordinates) : undefined,
    }))
    .sort(byDistance)
    .slice(0, limit)
    .map((ranked) => ranked.feature)
}
