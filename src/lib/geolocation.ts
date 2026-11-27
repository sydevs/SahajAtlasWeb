import type { Geojson } from '@/types'
import type { BBox } from 'geojson'
import type { PlaceSearch } from '@/lib/shape'

import { approxBounds, boundsOfPoints, distanceKm } from './geo'
import { geocodeCountryCode, reverseGeocode } from './geocode'

// The visibility logic behind the approximate-location "nearby classes"
// suggestion, factored out of the GeolocationSuggestion component so every
// condition is unit-tested (the component itself is hook-heavy, and the
// node lane cannot render it).

// Only suggest when a located class is within this radius (km) of the guess — a
// tight "genuinely near" bound so the prompt never leads to an empty search.
export const NEARBY_MAX_KM = 100

// Treat a region as the user's own "local" region when its centre sits
// within this radius (km) of the guess. A metro region's centre is near
// you. A country's is not.
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

/** The searched-place params (`?center`/`?q`) that suppress the suggestion. */
export const hasActivePlaceSearch = (params: URLSearchParams): boolean =>
  params.has('center') || params.has('q')

/**
 * Whether at least one *located* class in the feed is within `km` of the
 * `[longitude, latitude]` point. Online classes carry no geometry, so they
 * are naturally excluded. `undefined` (feed still loading) counts as "none".
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
 * How long a location request waits. Mapbox's default is six seconds, and iOS Safari appears to
 * count that while its permission prompt is open, so a visitor who took a moment to press Allow
 * saw a failure.
 */
export const LOCATE_POSITION_OPTIONS: PositionOptions = { timeout: 30_000 }

/**
 * A device fix rounded to about 110m, before anything serializes it, so the visitor's doorstep
 * never reaches a URL they might copy or the host page's analytics. Every place frame and list
 * rank this feeds is orders of magnitude coarser.
 */
export const coarsePoint = (coords: { longitude: number; latitude: number }): [number, number] => [
  roundCoordinate(coords.longitude),
  roundCoordinate(coords.latitude),
]

/** One coordinate to three decimals, about 110m: the precision any coordinate in a URL gets. */
export const roundCoordinate = (n: number): number => Math.round(n * 1e3) / 1e3

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
 * longitude gets a box spanning the world. This is pre-existing, and shared with every
 * other `approxBounds` caller. It is out of scope here.
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
  /** The guessed town's point, `[lng, lat]`, or `null` without a guess. */
  guess: [number, number] | null
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
 * Whether to show the approximate-location nearby suggestion.
 *
 * This is hidden in any of these cases:
 *
 * - There is no resolved guess.
 * - The suggestion was dismissed this session.
 * - A place search is already active.
 * - No located class is within `NEARBY_MAX_KM` of the guess (the suggestion would lead
 *   nowhere).
 * - The user is already viewing a region local to the guess.
 */
export const shouldShowGeolocationPrompt = ({
  guess,
  dismissed,
  activeSearch,
  geojson,
  regionCenter,
}: GeolocationPromptState): boolean => {
  if (!guess || dismissed || activeSearch) return false

  return (
    hasClassWithin(geojson, guess, NEARBY_MAX_KM) &&
    !isLocalRegion(regionCenter, guess, LOCAL_REGION_KM)
  )
}

/**
 * The search a guessed town opens. City-sized, not framed around the nearest classes as a
 * device fix is: an IP guess is too coarse for its nearest classes to be the visitor's. Already
 * public and coarse, so not rounded either; its name needs no reverse lookup.
 */
export const guessedPlace = (
  guess: { city: string; center: [number, number] },
  countryCode?: string,
  countryName?: string,
): PlaceSearch => ({
  q: countryName ? `${guess.city}, ${countryName}` : guess.city,
  center: guess.center,
  bbox: approxBounds(guess.center, NEARBY_RADIUS_KM),
  countryCode,
})

/**
 * Where a located visitor is, in the terms a typed search uses, for both ways in: the map's
 * "find my location" and the filters' Near me. The point and its frame are rounded at once; the
 * place's name and country follow from the reverse lookup, or `null` without one (`naming` is
 * off for a map-less embed, which promises no Mapbox calls). Each caller decides when to
 * navigate: the map moves first and names after, Near me waits briefly for the name.
 */
export const locatedPlace = (
  coords: { longitude: number; latitude: number },
  feed: Geojson | undefined,
  { locale, naming }: { locale?: string; naming: boolean },
): { place: PlaceSearch; named: Promise<Pick<PlaceSearch, 'q' | 'countryCode'> | null> } => {
  const center = coarsePoint(coords)
  const place = { center, bbox: nearbyBounds(center, feed).map(roundCoordinate) as BBox }
  const named = naming
    ? reverseGeocode(center, locale).then((feature) =>
        feature
          ? {
              q: feature.properties?.full_address ?? undefined,
              countryCode: geocodeCountryCode(feature),
            }
          : null,
      )
    : Promise.resolve(null)

  return { place, named }
}

/**
 * Whether a place page's search carries the location line: another country's page only, never
 * the visitor's own country, nor a region or a city. The first screen always may.
 */
export const locationLineHere = (
  near: 'home' | { level: string; countryCode?: string | null },
  visitorCountry?: string,
): boolean =>
  near === 'home' ||
  (near.level === 'country' && near.countryCode?.toUpperCase() !== visitorCountry)
