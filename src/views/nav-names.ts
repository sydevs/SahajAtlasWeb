import type { TranslationKey } from '@/types/i18next'
import type { StackEntry } from '@/lib/shape'

import { isoCountryCode, resolveStack, searchedPlaceName } from '@/lib/shape'

/**
 * What a place in the widget is CALLED, for the Back button.
 *
 * Names come from caches the app has already filled, read cache-only, so a miss costs the
 * specific name and never the control. This is pure, so it tests without pulling mapbox-gl, vaul
 * and every eager view into the node lane. The caches arrive as plain data for the same reason.
 */

/**
 * Only the shapes of call this module makes. Narrower than i18next's `TFunction` on purpose, so
 * the `t` from either `useTranslation()` or `useLocale()` fits without a cast.
 *
 * ⚠ Separate signatures, not one with `options?`. Under `strictInterpolationChecks`, on by
 * default since i18next 27, `TFunction` takes a key with options or a key alone, and an optional
 * parameter matches neither.
 */
type NavTranslate = {
  (key: TranslationKey): string
  (key: TranslationKey, options: { title: string }): string
  (key: TranslationKey, options: { place: string }): string
}

export type NavNaming = {
  t: NavTranslate
  /** A region's name by slug, from the cached region tree. */
  regionName?: (slug: string) => string | undefined
  /**
   * A country's name in the visitor's language, by its ISO code: the name RegionView's heading
   * shows, known before the region tree arrives, so a deep link never reads "GB" meanwhile.
   */
  countryName?: (code: string) => string | undefined
}

// A slug no cache names, made readable, so a person never reads a raw slug: "united-kingdom"
// reads "United Kingdom".
const readableSlug = (slug: string): string =>
  slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1))
    .join(' ')

/** The name of one stack entry, or `undefined` where nothing true is known. */
function entryName(
  entry: StackEntry,
  { t, regionName, countryName }: NavNaming,
): string | undefined {
  switch (entry.kind) {
    case 'region': {
      // A two-letter slug no cache names reads as its code: "GB".
      const code = isoCountryCode(entry.slug)

      return (
        (code && countryName?.(code)) ||
        regionName?.(entry.slug) ||
        code ||
        readableSlug(entry.slug)
      )
    }
    case 'online':
      return t('online.title')
    case 'search':
      return t('search.chrome.title')
    case 'calendar':
      return t('calendar.title')
    case 'filters':
      return t('filters.chrome.title')
    // A class is named by `backLabel`, and `register` and `share` are leaves, so neither can be
    // somewhere to go back to.
    default:
      return undefined
  }
}

/**
 * What Back says, for the route it goes to (`backStep`). "Back to" is said every time: on
 * a class opened from a poster, a bare "Lipanská 873/4" reads as an address, not a way back.
 * The two that name no place are whole sentences, so a translator can reorder them. A results
 * page names the place searched, so someone leaving a class knows what they will find there.
 */
export function backLabel(route: string, naming: NavNaming): string {
  const [pathname, query = ''] = route.split('?')
  const entry = resolveStack(pathname).at(-1)
  const { t } = naming

  if (!entry) return t('common.chrome.back_to_world_map')

  if (entry.kind === 'search') {
    const place = searchedPlaceName(new URLSearchParams(query).get('q'))

    if (place) return t('common.chrome.back_to_results_near', { place })
  }

  // Only Register and Share go back to a class, which is still on screen behind them.
  if (entry.kind === 'event') return t('common.chrome.back_to_class')

  const title = entryName(entry, naming)

  return title ? t('common.chrome.back_to', { title }) : t('common.chrome.back')
}
