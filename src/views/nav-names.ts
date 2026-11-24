import type { TranslationKey } from '@/types/i18next'
import type { StackEntry } from '@/lib/shape'

import { isoCountryCode, resolveStack } from '@/lib/shape'

/**
 * What a place in the widget is CALLED, for the Back button and the peek strips.
 *
 * Every strip used to say `t('common.chrome.back')`. So a three-deep stack handed a screen-reader
 * user three identically-named buttons, each going to a different place — the duplicate
 * accessible-name finding in issue #102.
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
export type NavTranslate = {
  (key: TranslationKey): string
  (key: TranslationKey, options: { title: string }): string
  (key: TranslationKey, options: { place: string }): string
}

export type NavNaming = {
  t: NavTranslate
  /**
   * Region names by slug. A Map, not the region array it comes from: this runs per strip per
   * render, and the region tree is the whole world's list.
   */
  regionNames?: ReadonlyMap<string, string>
  /**
   * A country's name in the visitor's language, by ISO code: the name RegionView's heading shows,
   * known before the region tree arrives, so a deep link never reads "GB" meanwhile.
   */
  countryName?: (code: string) => string | undefined
  titles?: ReadonlyMap<number, string>
}

// A slug no cache names, made readable, so a person never reads a raw slug: "united-kingdom"
// reads "United Kingdom", and a two-letter country code reads "GB".
const readableSlug = (slug: string): string =>
  /^[a-z]{2}$/i.test(slug)
    ? slug.toUpperCase()
    : slug
        .split('-')
        .filter(Boolean)
        .map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1))
        .join(' ')

/** The name of one stack entry, or `undefined` where nothing true is known. */
export function entryName(
  entry: StackEntry,
  { t, regionNames, countryName, titles }: NavNaming,
): string | undefined {
  switch (entry.kind) {
    case 'region': {
      const code = isoCountryCode(entry.slug)

      return (
        (code && countryName?.(code)) || regionNames?.get(entry.slug) || readableSlug(entry.slug)
      )
    }
    case 'event':
      return titles?.get(entry.id)
    case 'online':
      return t('online.title')
    case 'search':
      return t('search.chrome.title')
    case 'calendar':
      return t('calendar.title')
    case 'filters':
      return t('filters.chrome.title')
    // `register` and `share` are leaves, so neither can be somewhere to go back to.
    default:
      return undefined
  }
}

// The first part of a searched place: "Prague, Czechia" reads "Prague". Most of a full address
// is noise in a one-line button.
const shortPlace = (query: string | null): string | undefined =>
  query?.split(',')[0]?.trim() || undefined

/**
 * What Back says, for the route it goes to (`backDestination`). "Back to" is said every time: on
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
    const place = shortPlace(new URLSearchParams(query).get('q'))

    if (place) return t('common.chrome.back_to_results_near', { place })
  }

  const title = entryName(entry, naming)

  return title ? t('common.chrome.back_to', { title }) : t('common.chrome.back')
}

/** A peek strip's name: where pressing it goes. The root strip goes to the world map. */
export const stripLabel = (entry: StackEntry | undefined, naming: NavNaming): string =>
  backLabel(entry?.path ?? '/', naming)
