import type { BBox, Position } from 'geojson'

import { boundsOfPoints } from '@/lib/geo'

/**
 * Derives hierarchy aggregates (event counts, bounding boxes) from the GeoJSON
 * event feed. SahajCloud regions carry no `eventCount`/`bounds`, so each
 * country/region/area/venue's totals are computed from the events that fall
 * under it — matched by the event region's `breadcrumbs` ancestry.
 */

/** A geolocated event reduced to what hierarchy aggregation needs. */
export type GeoEvent = {
  /** `[longitude, latitude]`, or `null` for online / coordinate-less events. */
  point: Position | null
  /** Region ids of the event's full ancestry (country → … → city/center), inclusive. */
  ancestorIds: number[]
  /**
   * Whether the event is online (`eventType: 'online'`), classified upstream from
   * the event type — never from geometry, so a coordinate-less *offline* event
   * still counts as located. Online events belong to no place: they never affect
   * child cards, counts, or promotion, and surface only via the region roll-up.
   */
  online: boolean
}

type Breadcrumb = { doc?: number | { id: number } | null }

/**
 * The region-id ancestry encoded in a populated region's `breadcrumbs`
 * (country → … → self). At `depth=1` each `doc` is a numeric id; deeper
 * populations may inline the region object, so both are handled.
 */
export const ancestorIdsFromBreadcrumbs = (
  breadcrumbs: Breadcrumb[] | null | undefined,
): number[] =>
  (breadcrumbs ?? [])
    .map((crumb) => (typeof crumb.doc === 'number' ? crumb.doc : (crumb.doc?.id ?? null)))
    .filter((id): id is number => id !== null)

/** Events whose ancestry includes `regionId` (i.e. that fall under that region). */
export const eventsUnder = <T extends GeoEvent>(events: T[], regionId: number): T[] =>
  events.filter((event) => event.ancestorIds.includes(regionId))

/** Number of events under a region. */
export const countUnder = (events: GeoEvent[], regionId: number): number =>
  eventsUnder(events, regionId).length

/** Bounding box of the located events under a region, or `null` if none are located. */
export const boundsUnder = (events: GeoEvent[], regionId: number): BBox | null =>
  boundsOfPoints(
    eventsUnder(events, regionId)
      .map((event) => event.point)
      .filter((point): point is Position => point !== null),
  )

/** The events under a region, split into the buckets a region view renders. */
export type RegionPartition<T> = {
  /** Located events grouped by the direct child whose subtree contains them. */
  byChild: Map<number, T[]>
  /** Located events attached to the region itself, below no child. */
  direct: T[]
  /** Every online event under the region, for the roll-up (belongs to no child). */
  online: T[]
}

/**
 * Splits the events under `regionId` into its region view's buckets in a single
 * O(events) pass — replacing a per-child `countUnder` (O(children × events)):
 *
 * - `byChild` — located events keyed by the direct child (`childIds`) whose
 *   subtree holds them (the caller cards a child from its bucket size).
 * - `direct` — located events hanging off the region itself (for a childless
 *   leaf, `childIds: []`, this is every located event under it).
 * - `online` — every online event under the region, surfaced via the roll-up.
 *
 * A located event's ancestry meets `childIds` in exactly one place (the hierarchy
 * is a tree), so its attribution is unambiguous.
 */
export const partitionUnder = <T extends GeoEvent>(
  events: T[],
  regionId: number,
  childIds: number[],
): RegionPartition<T> => {
  const byChild = new Map<number, T[]>(childIds.map((id) => [id, []]))
  const direct: T[] = []
  const online: T[] = []

  for (const event of events) {
    if (!event.ancestorIds.includes(regionId)) continue

    if (event.online) {
      online.push(event)
      continue
    }

    const childId = event.ancestorIds.find((id) => byChild.has(id))
    const bucket = childId === undefined ? direct : byChild.get(childId)

    bucket?.push(event)
  }

  return { byChild, direct, online }
}
