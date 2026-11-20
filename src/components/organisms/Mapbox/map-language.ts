/** The two calls the sync needs, which a `MapRef` and a bare mapbox-gl `Map` both carry. */
export interface LanguageMap {
  getLanguage(): unknown
  setLanguage(language?: string): unknown
}

/**
 * Makes the map's label language the widget's current locale.
 *
 * `language` as a `<ReactMapGL>` prop is read once, at construction: react-map-gl has no
 * reconciliation for it, so a mid-session switch would otherwise leave every label in the first
 * language. mapbox-gl's `setLanguage` relabels the loaded style in place, and no-ops when the
 * map already has that language — so the effect calling it is free on every unrelated render.
 */
export function syncMapLanguage(map: LanguageMap | undefined, locale: string): boolean {
  if (!map || map.getLanguage() === locale) return false
  map.setLanguage(locale)

  return true
}

// ⚠ Keyed by LANGUAGE (ISO 639), valued by COUNTRY (ISO 3166), and the two differ where they look
// alike: Japanese is `ja`, and `jp` is Japan, a key no locale ever produces.
export const MAP_WORLDVIEWS: Record<string, string> = {
  zh: 'CN', // Chinese
  ja: 'JP', // Japanese
  hi: 'IN', // Hindi
  bn: 'IN', // Bengali
  pa: 'IN', // Punjabi
  gu: 'IN', // Gujarati
  kn: 'IN', // Kannada
  kok: 'IN', // Konkani
  ml: 'IN', // Malayalam
  mr: 'IN', // Marathi
  sa: 'IN', // Sanskrit
  ta: 'IN', // Tamil
  te: 'IN', // Telugu
  default: 'US', // Default
}

/** The worldview — whose version of a disputed border Mapbox draws — for a locale's language subtag. */
export const mapWorldview = (languageCode: string): string =>
  MAP_WORLDVIEWS[languageCode] || MAP_WORLDVIEWS.default
