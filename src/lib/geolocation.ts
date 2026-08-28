import type { Geojson } from '@/types'
import type { BBox } from 'geojson'

import { approxBounds, boundsOfPoints, distanceKm } from './geo'

// The visibility logic behind the IP-geolocation "nearby classes" suggestion,
// factored out of the GeolocationSuggestion component so every condition is
// unit-tested (the component itself is hook-heavy and the node lane can't render it).

// One session-scoped flag: dismissing the suggestion (× or clicking through) hides
// it for the rest of the browser session; it reappears on a fresh visit.
export const GEOLOCATION_DISMISS_KEY = 'atlas.geolocationPromptDismissed'

// Only suggest when a located class is within this radius (km) of the guess — a
// tight "genuinely near" bound so the prompt never leads to an empty search.
export const NEARBY_MAX_KM = 100

// Treat a region as the user's own "local" region when its centre sits within this
// radius (km) of the guess — a metro region's centre is near you, a country's isn't.
export const LOCAL_REGION_KM = 100

// A city-sized radius (km): the floor on any framed neighbourhood, so a located point is shown
// with its surroundings rather than as a pinpoint. Shared by the IP suggestion and the device
// fix — the same question at different precisions, and they should frame at the same scale.
export const NEARBY_RADIUS_KM = 25

// How many of the nearest classes the frame must contain. Low-stakes by design: in any city the
// NEARBY_RADIUS_KM floor already contains this many, so it only bites where classes are sparse —
// and there `NEARBY_MAX_KM` bounds how far it can reach. The map's job on arrival is orientation,
// not enumeration.
export const NEARBY_FIT_COUNT = 5

// sessionStorage can be absent or throw in sandboxed embeds / private mode, so both
// accessors degrade to "not dismissed" rather than crashing the suggestion.
export const readGeolocationDismissed = (): boolean => {
  try {
    return sessionStorage.getItem(GEOLOCATION_DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export const markGeolocationDismissed = (): void => {
  try {
    sessionStorage.setItem(GEOLOCATION_DISMISS_KEY, '1')
  } catch {
    // Dismissal just won't persist where sessionStorage is unavailable — acceptable.
  }
}

/** The searched-place params (`?center`/`?q`) that suppress the suggestion. */
export const hasActivePlaceSearch = (params: URLSearchParams): boolean =>
  params.has('center') || params.has('q')

/**
 * Whether at least one *located* class in the feed is within `km` of the
 * `[longitude, latitude]` point. Online classes carry no geometry, so they're
 * naturally excluded. `undefined` (feed still loading) counts as "none".
 */
export const hasClassWithin = (
  geojson: Geojson | undefined,
  point: [number, number],
  km: number,
): boolean =>
  !!geojson &&
  geojson.features.some(
    (feature) => feature.geometry != null && distanceKm(point, feature.geometry.coordinates) <= km,
  )

/**
 * The area to frame around a located visitor: their point, plus the nearest few classes.
 *
 * "Find my location" should answer *where are the classes near me*, so the camera has to hold
 * both the visitor and something to go to. Mapbox's own GeolocateControl instead fits the
 * accuracy circle at zoom 15 — a street corner, with every class off-screen.
 *
 * Two bounds keep the answer useful at both extremes, and both are reused rather than invented:
 *
 *  - a FLOOR of `minKm` (`NEARBY_RADIUS_KM`), so a visitor standing on top of the only nearby
 *    venue gets a neighbourhood rather than a zero-area box — the degenerate case `boundsOfPoints`
 *    would otherwise hand to `fitBounds`, which would zoom to its maximum.
 *  - a CAP of `maxKm` (`NEARBY_MAX_KM`), which is already this module's definition of "genuinely
 *    near": it is what decides whether the IP prompt is offered at all. A class the app declines
 *    to *suggest* has no business *widening the camera*. Being a radius cap it bounds the box at
 *    roughly 2·maxKm across however the feed is distributed, so a visitor in a country with no
 *    classes gets the floor box, never a continent.
 *
 * ⚠ Neither `@turf/bbox` nor `@turf/circle` handles the antimeridian, so a visitor at ±179°
 * longitude gets a box spanning the world. Pre-existing, and shared with every other
 * `approxBounds` caller; out of scope here.
 */
export const nearbyBounds = (
  point: [number, number],
  geojson: Geojson | undefined,
  opts?: { count?: number; minKm?: number; maxKm?: number },
): BBox => {
  const count = opts?.count ?? NEARBY_FIT_COUNT
  const minKm = opts?.minKm ?? NEARBY_RADIUS_KM
  const maxKm = opts?.maxKm ?? NEARBY_MAX_KM

  const nearest = (geojson?.features ?? [])
    // Online classes carry no geometry and so have no place in a frame.
    .flatMap((feature) => (feature.geometry ? [feature.geometry.coordinates] : []))
    .filter((coordinates) => distanceKm(point, coordinates) <= maxKm)
    .sort((a, b) => distanceKm(point, a) - distanceKm(point, b))
    .slice(0, count)

  // The floor arrives as its own corners rather than as a separate union step — `boundsOfPoints`
  // is already the union, and feeding it a box's extremes keeps every bit of the maths on turf.
  const floor = approxBounds(point, minKm)

  return boundsOfPoints([...nearest, [floor[0], floor[1]], [floor[2], floor[3]]]) as BBox
}

/** Whether the viewed region is local to the guess — its centre within `km`. */
export const isLocalRegion = (
  regionCenter: [number, number] | null | undefined,
  point: [number, number],
  km: number,
): boolean => !!regionCenter && distanceKm(point, regionCenter) <= km

/** The inputs the geolocation-prompt visibility decision reads. */
export type GeolocationPromptState = {
  /** The resolved IP guess, or `null` while loading / on failure. */
  guess: { latitude: number; longitude: number } | null
  /** Session-dismissed (× or accepted). */
  dismissed: boolean
  /** A place search is already active (SearchView with `?center`/`?q`). */
  activeSearch: boolean
  /** The cached event feed (`undefined` while loading). */
  geojson: Geojson | undefined
  /** The centre of the region currently viewed, if any (RegionView). */
  regionCenter?: [number, number] | null
}

/**
 * Whether to show the IP-geolocation nearby suggestion. Hidden when: there's no
 * resolved guess; it was dismissed this session; a place search is already active;
 * no located class is within `NEARBY_MAX_KM` of the guess (the suggestion would
 * lead nowhere); or the user is already viewing a region local to the guess.
 */
export const shouldShowGeolocationPrompt = ({
  guess,
  dismissed,
  activeSearch,
  geojson,
  regionCenter,
}: GeolocationPromptState): boolean => {
  if (!guess || dismissed || activeSearch) return false

  const point: [number, number] = [guess.longitude, guess.latitude]

  return (
    hasClassWithin(geojson, point, NEARBY_MAX_KM) &&
    !isLocalRegion(regionCenter, point, LOCAL_REGION_KM)
  )
}
