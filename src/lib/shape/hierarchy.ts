import type { BBox, Position } from 'geojson'

import { boundsOfPoints } from '@/lib/geo'

/**
 * The region-tree + event-aggregation layer over the GeoJSON feed. SahajCloud
 * regions carry no `eventCount`/`bounds`, so each country/region/area/venue's
 * totals are computed from the events under it — matched by walking the region
 * tree's `parent` links (the wholesale regions dict), see `ancestorIds`.
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

// ── Region tree (over the wholesale regions dict) ───────────────────────────────

/** The minimal region-node shape the tree index needs (a subset of `RegionNode`). */
export type RegionTreeNode = {
  id: number
  slug: string
  /** Parent region id; `null`/absent for a country root. */
  parent?: number | null
}

/** O(1) lookups over the wholesale region list: by id, by slug, and by parent. */
export type RegionIndex<T extends RegionTreeNode> = {
  byId: Map<number, T>
  bySlug: Map<string, T>
  childrenByParent: Map<number, T[]>
}

/**
 * Builds the id/slug/parent lookup maps for a region tree in one pass. Slugs are
 * globally unique across levels, so `bySlug` is unambiguous. Children keep their
 * incoming order (the wholesale read sorts by name).
 */
export const indexRegions = <T extends RegionTreeNode>(nodes: T[]): RegionIndex<T> => {
  const byId = new Map<number, T>()
  const bySlug = new Map<string, T>()
  const childrenByParent = new Map<number, T[]>()

  for (const node of nodes) {
    byId.set(node.id, node)
    bySlug.set(node.slug, node)

    if (node.parent != null) {
      const siblings = childrenByParent.get(node.parent)

      if (siblings) siblings.push(node)
      else childrenByParent.set(node.parent, [node])
    }
  }

  return { byId, bySlug, childrenByParent }
}

/** A region's direct children (empty for a leaf), in the index's name-sorted order. */
export const childrenOf = <T extends RegionTreeNode>(index: RegionIndex<T>, id: number): T[] =>
  index.childrenByParent.get(id) ?? []

/**
 * A region's full ancestry ids, self-inclusive (self → parent → … → country),
 * walked up the `parent` links. Replaces the feed's `breadcrumbs` chain now that
 * the wholesale regions dict carries every parent link. A `seen` guard stops a
 * malformed cycle from looping forever.
 */
export const ancestorIds = <T extends RegionTreeNode>(
  index: RegionIndex<T>,
  id: number,
): number[] => {
  const chain: number[] = []
  const seen = new Set<number>()
  let current: number | null | undefined = id

  while (current != null && !seen.has(current)) {
    seen.add(current)
    chain.push(current)
    current = index.byId.get(current)?.parent
  }

  return chain
}

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
