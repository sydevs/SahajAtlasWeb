import type { FeatureTypes, GeocodingFeatureContextComponent } from '@mapbox/search-js-core'

// PROTOTYPE (Anton, 6 Nov): inside a city every calendar entry said "London". Mapbox names the
// area around any point, in every country (Balham, Croydon, Edgware; 15th arrondissement; Koreatown),
// so the calendar asks it for each class's spot, in the browser, and caches the answer for the
// visit. The proper home is one field saved with the address in SahajCloud (the address already
// comes from Mapbox search and carries a mapboxId), looked up once when a class is saved. Keeping
// Mapbox results permanently may need Mapbox's permanent geocoding; check that before shipping.

/** The names Mapbox gives the area around a point, from the town down. */
export type AreaNames = { place?: string; locality?: string; neighborhood?: string }

const STORAGE_KEY = 'atlas.areaNames'
const memory = new Map<string, AreaNames>()
let restored = false

/** The cache key for a point: about 10 m, which is one venue. */
export const areaKey = ([lng, lat]: [number, number]): string =>
  `${lng.toFixed(4)},${lat.toFixed(4)}`

// sessionStorage can be absent or throw in sandboxed embeds and private mode: the cache is then
// the page's memory alone.
const restore = () => {
  if (restored) return
  restored = true
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}') as Record<
      string,
      AreaNames
    >

    for (const [key, names] of Object.entries(saved)) memory.set(key, names)
  } catch {
    // Nothing saved, or nothing to save to.
  }
}

const persist = () => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(memory)))
  } catch {
    // The memory cache still holds them for this page.
  }
}

/** What is already known for a point, without asking. */
export const cachedAreaNames = (point: [number, number]): AreaNames | undefined => {
  restore()

  return memory.get(areaKey(point))
}

/**
 * The area names around a point, from Mapbox's reverse geocoding (the address level, whose context
 * carries the neighbourhood, locality and place). Never throws: a failure resolves `null`, isn't
 * cached, and the calendar keeps today's label.
 */
export async function lookupAreaNames(
  point: [number, number],
  locale?: string,
): Promise<AreaNames | null> {
  const known = cachedAreaNames(point)

  if (known) return known
  const accessToken = import.meta.env.VITE_MAPBOX_ACCESSTOKEN

  if (!accessToken) return null

  try {
    const { GeocodingCore } = await import('@mapbox/search-js-core')
    const response = await new GeocodingCore({ accessToken }).reverse(
      { lng: point[0], lat: point[1] },
      { language: locale, limit: 1, types: new Set<FeatureTypes>(['address']) },
    )
    const context = response?.features?.[0]?.properties?.context as
      | Record<string, GeocodingFeatureContextComponent | undefined>
      | undefined
    const names: AreaNames = {
      place: context?.place?.name,
      locality: context?.locality?.name,
      neighborhood: context?.neighborhood?.name,
    }

    memory.set(areaKey(point), names)
    persist()

    return names
  } catch {
    return null
  }
}

const sameName = (a: string, b: string | undefined) =>
  b !== undefined && a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0

/**
 * The one name a class goes by on a page about `heading`: its town when that differs (Croydon
 * on a London page), otherwise the part of town (Balham), otherwise the locality (Manhattan).
 * `undefined` leaves today's label in place.
 */
export const areaLabel = (
  names: AreaNames | null | undefined,
  heading: string | undefined,
): string | undefined => {
  if (!names) return undefined
  if (names.place && !sameName(names.place, heading)) return names.place

  return names.neighborhood ?? names.locality ?? undefined
}
