import type { BBox, Position } from 'geojson'

import { byDistance, isOnline } from './event'
import { isoCountryCode } from './country'
import { FOREIGN_NEARBY_KM, FOREIGN_OTHER_CITIES_KM, NEARBY_KM, OTHER_CITIES_KM } from './reveal'

import { boundsOfPoints, distanceKm } from '@/lib/geo'

// The results of a place search, split into the groups a visitor reads: classes in the place
// itself, classes just outside it, classes in other towns within a day trip, online classes, and
// everything else.
// This is pure, like `revealRows`, which still pages the first and last of these groups. It is also
// the one rule for what a search covers: the filter counts read `localResults`, built on the same
// split, so the panel's numbers and the list's groups can't describe different sets.

/**
 * How big the searched place is, read from its bounding box. Each size has its own meaning of
 * "in this place" and of "nearby".
 *
 *  - `spot`: a street or neighbourhood, or no box at all. "In Hampstead" would miss the class one
 *    street over, so this group is a short radius instead.
 *  - `town`: a town or city. "In" is a circle as wide as the town (`placeRadiusKm`), never the
 *    box's corners: London's box holds Watford, 26 km out.
 *  - `area`: a country or large region. The distance to its centre says nothing, so the box and the
 *    country decide what is in it, and what lies outside is measured from its nearest class.
 */
export type PlaceSize = 'spot' | 'town' | 'area'

/** A box with a diagonal under this is a street or neighbourhood. */
const SPOT_DIAGONAL_KM = 10
/** A box with a diagonal over this is a country or large region. Sydney's is about 130 km. */
const AREA_DIAGONAL_KM = 200

/** What counts as "near" a spot. */
export const SPOT_RADIUS_KM = 15

/** Where a search stands, and what decides which of its classes are in the place. */
export type PlaceScope = {
  /** The searched place's box. It sizes the place; only a whole area's box says what is in it. */
  bbox?: BBox
  /** The geocoder's country (`?cc`). */
  searchCountry?: string
  /**
   * The search is the visitor's own position (Near me), so "Near you" is the whole nearby cut,
   * whichever country a class is in.
   */
  nearVisitor?: boolean
}

/** A `?bbox=w,s,e,n` value, or `undefined` when it isn't four finite numbers. */
export const parseBounds = (value: string | null): [number, number, number, number] | undefined => {
  if (!value) return undefined
  const nums = value.split(',').map(Number)

  return nums.length === 4 && nums.every(Number.isFinite)
    ? (nums as [number, number, number, number])
    : undefined
}

export const placeSize = (bbox: BBox | undefined): PlaceSize => {
  if (!bbox) return 'spot'
  const diagonal = distanceKm([bbox[0], bbox[1]], [bbox[2], bbox[3]])

  if (diagonal < SPOT_DIAGONAL_KM) return 'spot'

  return diagonal > AREA_DIAGONAL_KM ? 'area' : 'town'
}

/** The minimum an event needs to be sorted into a group. */
type Sectionable = Parameters<typeof isOnline>[0] & {
  distance?: number
  address?: {
    country?: string | null
    latitude?: number | null
    longitude?: number | null
  } | null
}

const pointOf = (event: Sectionable): Position | null => {
  const { latitude, longitude } = event.address ?? {}

  return latitude == null || longitude == null ? null : [longitude, latitude]
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)

const inBounds = (point: Position, bbox: BBox) =>
  point[0] >= bbox[0] && point[0] <= bbox[2] && point[1] >= bbox[1] && point[1] <= bbox[3]

/**
 * How far from the searched point a class is still in the place: half the box's narrower side,
 * and never past the nearby cut, so everything "in" the place is also inside the radius the filter
 * counts name. London's box gives about 23 km. A spot keeps its own short radius.
 */
export const placeRadiusKm = (bbox: BBox | undefined): number => {
  if (!bbox || placeSize(bbox) === 'spot') return SPOT_RADIUS_KM
  const [west, south, east, north] = bbox
  const midLatitude = (south + north) / 2
  const midLongitude = (west + east) / 2
  const narrower = Math.min(
    distanceKm([west, midLatitude], [east, midLatitude]),
    distanceKm([midLongitude, south], [midLongitude, north]),
  )

  return Math.min(NEARBY_KM, narrower / 2)
}

/** The distance from a point to the nearest edge of a box, 0 when it is inside. */
export const distanceToBounds = (point: Position, bbox: BBox): number =>
  distanceKm(point, [clamp(point[0], bbox[0], bbox[2]), clamp(point[1], bbox[1], bbox[3])])

/**
 * The distance from a point to the nearest of these, or `undefined` with none. A map search's box
 * for a country is a rectangle that holds half its neighbours (Germany's holds Prague), and a real
 * class is what someone would actually be comparing with.
 */
export const distanceToNearest = (point: Position, points: Position[]): number | undefined =>
  points.length === 0
    ? undefined
    : points.reduce((nearest, other) => Math.min(nearest, distanceKm(point, other)), Infinity)

export type ResultSections<T> = {
  size: PlaceSize
  /** In the searched place. Order kept from the input. */
  here: T[]
  /** In-person, just outside the place, within the 25 km nearby cut. Nearest first. */
  justOutside: T[]
  /** In-person, in other towns past that cut, up to `OTHER_CITIES_KM`. Nearest first. */
  nearby: T[]
  /** Online. Order kept from the input. */
  online: T[]
  /** In-person and past the other-cities limit. Nearest first. */
  distant: T[]
}

/** One in-person class, read against a scope. */
type Located<T> = { event: T; point: Position | null; foreign: boolean; here: boolean }

/**
 * How a scope reads each in-person class: whether it is in the place, and whether it is across a
 * border. `areaBox` is set only for a whole area, which measures a class outside it from its own
 * classes rather than from the searched point. `splitResults` and `localResultsOf` both read
 * classes through this, so the list's groups and the filter counts can't drift apart.
 *
 * A country code that doesn't resolve never counts as foreign: the CMS field is free text, and
 * "Tschechien" is not a reason to push a class out of the Czech results.
 */
const placeRule = ({ bbox, searchCountry, nearVisitor = false }: PlaceScope) => {
  const size = placeSize(bbox)
  // Every size but a whole area is a circle around the searched point. Near me is the nearby cut.
  const round = nearVisitor || size !== 'area'
  const radius = nearVisitor ? NEARBY_KM : placeRadiusKm(bbox)

  const locate = <T extends Sectionable>(event: T): Located<T> => {
    const point = pointOf(event)
    const country = isoCountryCode(event.address?.country)
    const foreign = Boolean(searchCountry && country && country !== searchCountry)
    // Near a spot or near you is only distance. In a named town, a class over the border isn't.
    const here = round
      ? (event.distance ?? Infinity) <= radius && (size === 'spot' || nearVisitor || !foreign)
      : Boolean(bbox && point && inBounds(point, bbox)) && !foreign

    return { event, point, foreign, here }
  }

  return { size, areaBox: round ? undefined : bbox, locate }
}

/** How far outside the place a class can be and still count as just outside it. */
const justOutsideKm = (foreign: boolean) => (foreign ? FOREIGN_NEARBY_KM : NEARBY_KM)

/**
 * Sorts the matches into their groups. `keepOrder` holds the groups outside the place in the order
 * they came in, for a visitor who explicitly asked for Soonest.
 */
export function splitResults<T extends Sectionable>(
  events: T[],
  { keepOrder = false, ...scope }: PlaceScope & { keepOrder?: boolean },
): ResultSections<T> {
  const { size, areaBox, locate } = placeRule(scope)
  const groups: ResultSections<T> = {
    size,
    here: [],
    justOutside: [],
    nearby: [],
    online: [],
    distant: [],
  }
  // An area measures from its own classes, everything else from the searched point. `T` is only
  // known structurally here, so the measure is kept beside the event instead of written onto it.
  const reach = new Map<T, number>()
  const outside: Located<T>[] = []
  const own: Position[] = []

  for (const event of events) {
    if (isOnline(event)) {
      groups.online.push(event)
      continue
    }

    const located = locate(event)

    if (located.here) {
      groups.here.push(event)
      if (located.point) own.push(located.point)
      continue
    }

    outside.push(located)
  }

  for (const { event, point, foreign } of outside) {
    // With filters hiding all of the area's own classes, its box is what is left to measure from.
    const km =
      areaBox && point
        ? (distanceToNearest(point, own) ?? distanceToBounds(point, areaBox))
        : event.distance

    const far = km ?? Infinity

    reach.set(event, far)
    if (far <= justOutsideKm(foreign)) groups.justOutside.push(event)
    else if (far <= (foreign ? FOREIGN_OTHER_CITIES_KM : OTHER_CITIES_KM)) groups.nearby.push(event)
    else groups.distant.push(event)
  }

  if (!keepOrder) {
    const nearestFirst = (a: T, b: T) =>
      byDistance({ distance: reach.get(a) }, { distance: reach.get(b) })

    groups.justOutside.sort(nearestFirst)
    groups.nearby.sort(nearestFirst)
    groups.distant.sort(nearestFirst)
  }

  return groups
}

/**
 * The classes a search covers in full, and the filter counts count: the place, just outside it,
 * and online. Other cities and farther ones wait behind their own fold, under their own count.
 */
export const localResults = <T extends Sectionable>(events: T[], scope: PlaceScope): T[] => {
  const { here, justOutside, online } = splitResults(events, { ...scope, keepOrder: true })

  return [...here, ...justOutside, ...online]
}

/**
 * `localResults` for any subset of `events`, with the measuring done once.
 *
 * The filter counts ask for thirty to fifty subsets on every tap. Whether a class just past an
 * area's edge counts depends on which of the area's own classes are in the subset, since it is
 * measured from the nearest of them, so working that out afresh is every class outside against
 * every class inside, per subset. That made a filter tap lag in a country search. Here each class
 * outside keeps, once, the area's classes close enough to count from, and whether it is within
 * reach of the box's edge for when none of them are left. A subset then checks only those.
 *
 * The subset must be drawn from `events`. It answers the same classes as
 * `localResults(subset, scope)`, in the subset's order.
 */
export const localResultsOf = <T extends Sectionable>(
  events: T[],
  scope: PlaceScope,
): ((subset: T[]) => T[]) => {
  const { areaBox, locate } = placeRule(scope)
  // `true`: counted in any subset that holds it. `false`: in none. Otherwise it is past an area's
  // edge, and counted when the subset holds one of `near`, or holds none of the area's classes
  // and `edge` is set.
  const rules = new Map<T, boolean | { near: T[]; edge: boolean }>()
  const own: { event: T; point: Position }[] = []
  const outside: Located<T>[] = []

  for (const event of events) {
    if (isOnline(event)) {
      rules.set(event, true)
      continue
    }

    const located = locate(event)

    if (!located.here) {
      outside.push(located)
      continue
    }

    rules.set(event, true)
    if (located.point) own.push({ event, point: located.point })
  }

  for (const { event, point, foreign } of outside) {
    const limit = justOutsideKm(foreign)

    if (!areaBox || !point) {
      rules.set(event, (event.distance ?? Infinity) <= limit)
      continue
    }

    rules.set(event, {
      near: own.filter((other) => distanceKm(point, other.point) <= limit).map((o) => o.event),
      edge: distanceToBounds(point, areaBox) <= limit,
    })
  }

  return (subset) => {
    if (subset.some((event) => !rules.has(event))) return localResults(subset, scope)

    const present = new Set(subset)
    const ownPresent = own.some((other) => present.has(other.event))

    return subset.filter((event) => {
      const rule = rules.get(event) ?? false

      if (typeof rule === 'boolean') return rule

      return ownPresent ? rule.near.some((other) => present.has(other)) : rule.edge
    })
  }
}

/**
 * The classes that could be in the place or just outside it under some filters: a cheap first cut
 * before `localResults`, so a filter tap doesn't measure the whole world against an area's classes.
 * An area's own classes sit in its box, and nothing just outside is farther than the nearby cut.
 */
export const nearPlace = <T extends Sectionable>(events: T[], scope: PlaceScope): T[] => {
  const { bbox, nearVisitor } = scope
  const area = !nearVisitor && placeSize(bbox) === 'area'

  return events.filter((event) => {
    if (isOnline(event)) return true
    if (!area || !bbox) return (event.distance ?? Infinity) <= NEARBY_KM
    const point = pointOf(event)

    return point !== null && distanceToBounds(point, bbox) <= NEARBY_KM
  })
}

/** How many of the nearest classes a place with none of its own frames, so a pin is in view. */
const NEAREST_TO_FRAME = 3

/**
 * The box holding a searched place and these classes. `count` keeps only the nearest few, which
 * must be the first in the list.
 */
export const boundsWith = <T extends Sectionable>(
  place: BBox | undefined,
  center: Position,
  events: T[],
  count = NEAREST_TO_FRAME,
): [number, number, number, number] | undefined => {
  const points = events.slice(0, count).flatMap((event) => {
    const point = pointOf(event)

    return point ? [point] : []
  })
  const corners: Position[] = place
    ? [
        [place[0], place[1]],
        [place[2], place[3]],
      ]
    : [center]

  return boundsOfPoints([...points, ...corners]) as [number, number, number, number] | undefined
}

/**
 * What a place search frames. A place with classes of its own frames just the place. One with none
 * frames the place and its nearest few, so a pin is in view: those just outside it, else those in
 * other towns (up to `OTHER_CITIES_KM`), so a place with nothing close still shows where the
 * nearest are without zooming out to a continent.
 */
export const searchFrame = <T extends Sectionable>(
  { here, justOutside, nearby }: ResultSections<T>,
  place: [number, number, number, number] | undefined,
  center: Position,
): [number, number, number, number] | undefined => {
  if (here.length > 0) return place
  const nearest = justOutside.length > 0 ? justOutside : nearby

  return nearest.length > 0 ? boundsWith(place, center, nearest) : place
}
