import type { TranslationKey } from '@/types/i18next'
import type { StackEntry } from '@/lib/shape'

import { resolveStack } from '@/lib/shape'

/**
 * What a place in the widget is CALLED, for the Back button and the breadcrumb line.
 *
 * The names come from caches the app has already filled, so a miss costs the specific name
 * and never the control. This is pure, so it tests without pulling mapbox-gl, vaul and every
 * eager view into the node lane. The caches arrive as plain data for the same reason.
 */

/**
 * Only the calls this module makes. Narrower than i18next's `TFunction` on purpose, so the
 * `t` from either `useTranslation()` or `useLocale()` fits without a cast.
 */
export type NavTranslate = (
  key: TranslationKey,
  options?: { title: string } | { place: string },
) => string

export type NavNaming = {
  t: NavTranslate
  /** Region names by slug. A Map, because the region tree is the whole world's list. */
  regionNames?: ReadonlyMap<string, string>
  titles?: ReadonlyMap<number, string>
}

/** The name of one stack entry, or `undefined` where nothing true is known. */
export function entryName(entry: StackEntry, { t, regionNames, titles }: NavNaming) {
  switch (entry.kind) {
    case 'region':
      return regionNames?.get(entry.slug) ?? entry.slug
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

/**
 * The first part of a searched place: "Prague, Czechia" reads as "Prague". The list is
 * ranked by distance, and most of a full address is noise in a one-line button.
 */
const shortPlace = (query: string | null): string | undefined =>
  query?.split(',')[0]?.trim() || undefined

/**
 * What the Back button says, given the route `backDestination` returned. "Back to" is said
 * every time: on a class opened from a poster, a bare "Lipanská 873/4" reads as an address
 * rather than a way back. These are whole sentences so a translator can reorder them. A
 * results page names the place searched, so someone coming back from a class knows what
 * they will find there.
 */
export function backLabel(route: string, naming: NavNaming): string {
  const [pathname, query = ''] = route.split('?')
  const entry = resolveStack(pathname).at(-1)
  const { t } = naming

  if (!entry) return t('common.chrome.back_to_countries')

  if (entry.kind === 'search') {
    const place = shortPlace(new URLSearchParams(query).get('q'))

    return place
      ? t('common.chrome.back_to_results_near', { place })
      : t('common.chrome.back_to_results')
  }

  const title = entryName(entry, naming)

  if (title) return t('common.chrome.back_to', { title })

  return entry.kind === 'event' ? t('common.chrome.back_to_class') : t('common.chrome.back')
}
