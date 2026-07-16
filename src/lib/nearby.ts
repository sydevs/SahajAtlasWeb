import type { Geojson } from '@/types'

import { distanceKm } from './geo'

// The visibility logic behind the IP-geolocation "nearby classes" suggestion,
// factored out of the NearbySuggestion component so every condition is unit-tested
// (the component itself is hook-heavy and the node lane can't render it).

// One session-scoped flag: dismissing the suggestion (× or clicking through) hides
// it for the rest of the browser session; it reappears on a fresh visit.
export const NEARBY_DISMISS_KEY = 'sahajAtlas.nearbyPromptDismissed'

// Only suggest when a located class is within this radius (km) of the guess — a
// tight "genuinely near" bound so the prompt never leads to an empty search.
export const NEARBY_MAX_KM = 100

// Treat a region as the user's own "local" region when its centre sits within this
// radius (km) of the guess — a metro region's centre is near you, a country's isn't.
export const LOCAL_REGION_KM = 100

// sessionStorage can be absent or throw in sandboxed embeds / private mode, so both
// accessors degrade to "not dismissed" rather than crashing the suggestion.
export const readNearbyDismissed = (): boolean => {
  try {
    return sessionStorage.getItem(NEARBY_DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export const markNearbyDismissed = (): void => {
  try {
    sessionStorage.setItem(NEARBY_DISMISS_KEY, '1')
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

/** Whether the viewed region is local to the guess — its centre within `km`. */
export const isLocalRegion = (
  regionCenter: [number, number] | null | undefined,
  point: [number, number],
  km: number,
): boolean => !!regionCenter && distanceKm(point, regionCenter) <= km

/** The inputs the nearby-prompt visibility decision reads. */
export type NearbyPromptState = {
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
export const shouldShowNearbyPrompt = ({
  guess,
  dismissed,
  activeSearch,
  geojson,
  regionCenter,
}: NearbyPromptState): boolean => {
  if (!guess || dismissed || activeSearch) return false

  const point: [number, number] = [guess.longitude, guess.latitude]

  return (
    hasClassWithin(geojson, point, NEARBY_MAX_KM) &&
    !isLocalRegion(regionCenter, point, LOCAL_REGION_KM)
  )
}
