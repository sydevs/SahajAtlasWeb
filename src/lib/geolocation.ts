import type { Geojson } from '@/types'
import type { BBox } from 'geojson'

import { approxBounds, distanceKm } from './geo'

// The visibility logic behind the IP-geolocation "nearby classes"
// suggestion, factored out of the GeolocationSuggestion component so every
// condition is unit-tested (the component itself is hook-heavy, and the
// node lane cannot render it).

// One session-scoped flag: dismissing the suggestion (× or clicking through)
// hides it for the rest of the browser session. It reappears on a fresh visit.
export const GEOLOCATION_DISMISS_KEY = 'atlas.geolocationPromptDismissed'

// Only suggest when a located class is within this radius (km) of the guess — a
// tight "genuinely near" bound so the prompt never leads to an empty search.
export const NEARBY_MAX_KM = 100

// Treat a region as the user's own "local" region when its centre sits
// within this radius (km) of the guess. A metro region's centre is near
// you. A country's is not.
export const LOCAL_REGION_KM = 100

// A city-sized radius (km): the place a located visitor searches (`aroundVisitor`), so a located
// point is shown with its surroundings rather than as a pinpoint. Shared by the IP suggestion and
// the device fix — the same question at different precisions, so they cover the same area.
export const NEARBY_RADIUS_KM = 25

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
    // Dismissal will not persist where sessionStorage is unavailable. This is acceptable.
  }
}

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
 * The place a located visitor searches: a town-sized box of `NEARBY_RADIUS_KM` around them, for
 * the IP guess and the device fix alike.
 *
 * The box is what counts as "in" the town the search is named after, so it never stretches to
 * reach classes. It used to take in the nearest five, and in Prague that reached Liberec, 90 km
 * away, which then showed under "In Prague" (Anton, 6 Nov). When the box holds no class,
 * SearchView frames the nearest ones beside it instead (`searchFrame`).
 *
 * ⚠ Neither `@turf/bbox` nor `@turf/circle` handles the antimeridian, so a visitor at ±179°
 * longitude gets a box spanning the world. This is shared with every other `approxBounds` caller.
 */
export const aroundVisitor = (point: [number, number]): BBox =>
  approxBounds(point, NEARBY_RADIUS_KM)

/** Whether the viewed region is local to the guess — its centre within `km`. */
export const isLocalRegion = (
  regionCenter: [number, number] | null | undefined,
  point: [number, number],
  km: number,
): boolean => !!regionCenter && distanceKm(point, regionCenter) <= km

/** The inputs the geolocation-prompt visibility decision reads. */
export type GeolocationPromptState = {
  /** The resolved IP guess, or `null` while loading / on failure. */
  guess: { latitude: number; longitude: number; country_code?: string } | null
  /** Session-dismissed (× or accepted). */
  dismissed: boolean
  /** A place search is already active (SearchView with `?center`/`?q`). */
  activeSearch: boolean
  /** The cached event feed (`undefined` while loading). */
  geojson: Geojson | undefined
  /** The centre of the region currently viewed, if any (RegionView). */
  regionCenter?: [number, number] | null
  /** The country currently viewed, if any (a country-level RegionView). */
  viewedCountry?: string | null
}

/**
 * Whether to show the IP-geolocation nearby suggestion.
 *
 * This is hidden in any of these cases:
 *
 * - There is no resolved guess.
 * - The suggestion was dismissed this session.
 * - A place search is already active.
 * - No located class is within `NEARBY_MAX_KM` of the guess (the suggestion would lead
 *   nowhere).
 * - The user is already viewing a region local to the guess.
 * - The user is already viewing the country of the guess: its list is the answer, whichever part
 *   of it they are in.
 *
 * The views decide the levels it belongs to: the world and a country. Below a country the
 * visitor has already said where they are looking, so it is never rendered there.
 */
export const shouldShowGeolocationPrompt = ({
  guess,
  dismissed,
  activeSearch,
  geojson,
  regionCenter,
  viewedCountry,
}: GeolocationPromptState): boolean => {
  if (!guess || dismissed || activeSearch) return false
  if (
    viewedCountry &&
    guess.country_code?.toLocaleUpperCase() === viewedCountry.toLocaleUpperCase()
  ) {
    return false
  }

  const point: [number, number] = [guess.longitude, guess.latitude]

  return (
    hasClassWithin(geojson, point, NEARBY_MAX_KM) &&
    !isLocalRegion(regionCenter, point, LOCAL_REGION_KM)
  )
}
