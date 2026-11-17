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
