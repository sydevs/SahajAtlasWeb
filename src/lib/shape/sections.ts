import type { BBox, Position } from 'geojson'

import { byDistance, isOnline } from './event'
import { isoCountryCode } from './country'
import { FOREIGN_NEARBY_KM, NEARBY_KM } from './reveal'

import { boundsOfPoints, distanceKm } from '@/lib/geo'
import { NEARBY_MAX_KM } from '@/lib/geolocation'

// The results of a place search, split into the groups a visitor reads: classes in the place
// itself, classes in other towns close enough to reach, online classes, and everything else.
// This is pure, like `revealRows`, which still pages the first and last of these groups.

/**
 * How big the searched place is, read from its bounding box. Each size has its own meaning of
 * "in this place" and of "nearby".
 *
 *  - `spot`: a street or neighbourhood, or no box at all. "In Hampstead" would miss the class one
 *    street over, so this group is a short radius instead.
 *  - `town`: a town or city. The box is the place.
 *  - `area`: a country or large region. The distance to its centre says nothing, so what lies
 *    outside is measured from the nearest class inside it.
 */
export type PlaceSize = 'spot' | 'town' | 'area'

/** A box with a diagonal under this is a street or neighbourhood. */
const SPOT_DIAGONAL_KM = 10
/** A box with a diagonal over this is a country or large region. Sydney's is about 130 km. */
const AREA_DIAGONAL_KM = 200

/** What counts as "near" a spot. */
export const SPOT_RADIUS_KM = 15

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
  /** In-person, outside the place, close enough to reach. Nearest first. */
  nearby: T[]
  /** Online. Order kept from the input. */
  online: T[]
  /** In-person and past the nearby limit. Nearest first. */
  distant: T[]
}

/**
 * Sorts the matches into their groups. `keepOrder` holds `nearby` and `distant` in the order they
 * came in, for a visitor who explicitly asked for Soonest.
 *
 * A country code that doesn't resolve never counts as foreign: the CMS field is free text, and
 * "Tschechien" is not a reason to push a class out of the Czech results.
 */
export function splitResults<T extends Sectionable>(
  events: T[],
  {
    bbox,
    searchCountry,
    keepOrder = false,
  }: { bbox?: BBox; searchCountry?: string; keepOrder?: boolean },
): ResultSections<T> {
  const size = placeSize(bbox)
  const groups: ResultSections<T> = { size, here: [], nearby: [], online: [], distant: [] }
  // An area measures from its own classes, everything else from the searched point. `T` is only
  // known structurally here, so the measure is kept beside the event instead of written onto it.
  const reach = new Map<T, number>()
  const outside: { event: T; point: Position | null; foreign: boolean }[] = []
  const own: Position[] = []

  for (const event of events) {
    if (isOnline(event)) {
      groups.online.push(event)
      continue
    }

    const point = pointOf(event)
    const country = isoCountryCode(event.address?.country)
    const foreign = Boolean(searchCountry && country && country !== searchCountry)
    const inBox =
      bbox && point
        ? point[0] >= bbox[0] && point[0] <= bbox[2] && point[1] >= bbox[1] && point[1] <= bbox[3]
        : false
    const isHere =
      size === 'spot' ? (event.distance ?? Infinity) <= SPOT_RADIUS_KM : inBox && !foreign

    if (isHere) {
      groups.here.push(event)
      if (point) own.push(point)
      continue
    }

    outside.push({ event, point, foreign })
  }

  for (const { event, point, foreign } of outside) {
    // With filters hiding all of the area's own classes, its box is what is left to measure from.
    const km =
      size === 'area' && bbox && point
        ? (distanceToNearest(point, own) ?? distanceToBounds(point, bbox))
        : event.distance

    reach.set(event, km ?? Infinity)
    if ((km ?? Infinity) <= (foreign ? FOREIGN_NEARBY_KM : NEARBY_KM)) groups.nearby.push(event)
    else groups.distant.push(event)
  }

  if (!keepOrder) {
    const nearestFirst = (a: T, b: T) =>
      byDistance({ distance: reach.get(a) }, { distance: reach.get(b) })

    groups.nearby.sort(nearestFirst)
    groups.distant.sort(nearestFirst)
  }

  return groups
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
 * frames the place and its nearest few, so a pin is in view: the nearby group first, else the
 * nearest farther classes up to `reachKm`, so a place with nothing close still shows where the
 * nearest are without zooming out to a continent.
 */
export const searchFrame = <T extends Sectionable>(
  { here, nearby, distant }: ResultSections<T>,
  place: [number, number, number, number] | undefined,
  center: Position,
  reachKm = NEARBY_MAX_KM,
): [number, number, number, number] | undefined => {
  if (here.length > 0) return place
  const nearest =
    nearby.length > 0 ? nearby : distant.filter((event) => (event.distance ?? Infinity) <= reachKm)

  return nearest.length > 0 ? boundsWith(place, center, nearest) : place
}
