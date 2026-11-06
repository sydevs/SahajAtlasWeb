import type { FeatureTypes, GeocodingFeatureContextComponent } from '@mapbox/search-js-core'

// PROTOTYPE (Anton, 6 Nov): inside a city every calendar entry said "London". Mapbox names the
// area around any point, in every country (Balham, Croydon, Edgware; 15th arrondissement; Koreatown),
// so the calendar asks it for each class's spot, in the browser, and caches the answer for the
// visit. The proper home is one field saved with the address in SahajCloud (the address already
// comes from Mapbox search and carries a mapboxId), looked up once when a class is saved. Keeping
// Mapbox results permanently may need Mapbox's permanent geocoding; check that before shipping.

/** The names Mapbox gives the area around a point, from the town down. */
export type AreaNames = { place?: string; locality?: string; neighborhood?: string }

/** ⚠ Listed in `docs/embedding.md`'s storage table: a host's privacy notice describes it. */
export const AREA_NAMES_STORAGE_KEY = 'atlas.areaNames'

/** How many spots one calendar screen looks up at most: a city's venues, never the world's. */
export const MAX_AREA_LOOKUPS = 30

const memory = new Map<string, AreaNames>()
let restored = false

/** A point's identity: about 10 m, which is one venue. */
export const areaKey = ([lng, lat]: [number, number]): string =>
  `${lng.toFixed(4)},${lat.toFixed(4)}`

// Mapbox answers in the language asked for (Prague / Praha), so a language switch must not reuse
// the names of the last one.
const cacheKey = (point: [number, number], locale: string) => `${locale}|${areaKey(point)}`

// sessionStorage can be absent or throw in sandboxed embeds and private mode: the cache is then
// the page's memory alone.
const restore = () => {
  if (restored) return
  restored = true
  try {
    const saved = JSON.parse(sessionStorage.getItem(AREA_NAMES_STORAGE_KEY) ?? '{}') as Record<
      string,
      AreaNames
    >

    for (const [key, names] of Object.entries(saved)) {
      // An entry saved before names were kept per language has no `locale|` part.
      if (key.includes('|')) memory.set(key, names)
    }
  } catch {
    // Nothing saved, or nothing to save to.
  }
}

const persist = () => {
  try {
    sessionStorage.setItem(AREA_NAMES_STORAGE_KEY, JSON.stringify(Object.fromEntries(memory)))
  } catch {
    // The memory cache still holds them for this page.
  }
}

/** What is already known for a point in this language, without asking. */
export const cachedAreaNames = (point: [number, number], locale: string): AreaNames | undefined => {
  restore()

  return memory.get(cacheKey(point, locale))
}

/**
 * The area names around a point, from Mapbox's reverse geocoding (the address level, whose context
 * carries the neighbourhood, locality and place). Never throws: a failure resolves `null`, isn't
 * cached, and the calendar keeps today's label.
 */
export async function lookupAreaNames(
  point: [number, number],
  locale: string,
): Promise<AreaNames | null> {
  const known = cachedAreaNames(point, locale)

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

    memory.set(cacheKey(point, locale), names)
    persist()

    return names
  } catch {
    return null
  }
}

const sameName = (a: string, b: string | undefined) =>
  b !== undefined && a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0

/**
 * The spots worth asking Mapbox about: those whose label today is just the page's own place
 * ("London" on the London calendar). Anywhere else the label already names the town, so a lookup
 * would only repeat it, and with no place heading (the world calendar) nothing is asked at all.
 * Unique by `areaKey`, in calendar order, at most `MAX_AREA_LOOKUPS`.
 */
export const areaLookupPoints = (
  entries: readonly { point?: [number, number] | null; place?: string }[],
  heading: string | undefined,
): [number, number][] => {
  if (!heading) return []

  const byKey = new Map<string, [number, number]>()

  for (const { point, place } of entries) {
    if (byKey.size >= MAX_AREA_LOOKUPS) break
    if (point && place && sameName(place, heading)) byKey.set(areaKey(point), point)
  }

  return [...byKey.values()]
}

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
