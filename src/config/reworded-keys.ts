import type { i18n as I18n } from 'i18next'

/**
 * Keys this build rewords under a new name, each beside the SahajCloud key whose copy it replaces.
 *
 * SahajCloud's bundle wins over the snapshot for every key it already holds (`applyBundle` in
 * `locale.ts`), so rewording one of those keys here never reaches the screen: "Showing 25 of 419
 * events" stayed. A new key does reach English, from the snapshot. But a plain rename would cost
 * every other language its translation, because a key SahajCloud doesn't hold yet falls back to
 * English there: French would read "No classes found." instead of "Aucun événement trouvé.".
 *
 * So both keys stay, and `rewordedKey` picks between them. The new key wins in a locale that holds
 * it, which English always does, from the snapshot. Any other locale reads the old key's
 * translation until SahajCloud ships the new key there. Once SahajCloud ships the new key in every
 * locale, or rewords the old one instead, delete the entry and call the surviving key directly.
 * The old keys keep SahajCloud's own English in the snapshot, since it is SahajCloud's copy.
 */
export const REWORDED_KEYS = {
  'common.errors.classes_near_city': 'common.errors.near_city',
  'common.errors.no_classes': 'common.errors.no_events',
  'search.filtered.none': 'filters.chrome.no_results',
  'search.results.no_nearby_classes': 'search.results.no_nearby',
  'search.results.showing_classes': 'search.results.showing',
  'submit.review.note_label_admins': 'submit.review.note_label',
  'submit.where.city_help_admins': 'submit.where.city_help',
} as const

type Reworded = typeof REWORDED_KEYS

/** The key `rewordedKey` can answer for `K`: itself, or the SahajCloud key it rewords. */
export type RewordedKey<K extends string> = K | (K extends keyof Reworded ? Reworded[K] : never)

/** The part of i18next this reads. Partial, because a spec's stub may not carry a resource store. */
type ResourceReader = Partial<Pick<I18n, 'getResource' | 'language' | 'resolvedLanguage'>>

/**
 * The key to translate for `key` in the active locale: the new key where that locale holds it,
 * else the SahajCloud key it rewords. Any key outside `REWORDED_KEYS` comes back unchanged.
 *
 * Call it inside the render that calls `t`: `useTranslation` re-renders on a language change, so
 * the choice follows the locale.
 */
export function rewordedKey<K extends string>(i18n: ResourceReader, key: K): RewordedKey<K> {
  // `hasOwnProperty` through the prototype, never `key in`: a host page may patch
  // `Object.prototype`, and a key named `toString` must not read as reworded.
  if (!Object.prototype.hasOwnProperty.call(REWORDED_KEYS, key)) return key

  const locale = i18n.resolvedLanguage ?? i18n.language

  // A stub with no resource store has nothing to choose by, so the new key stands.
  if (!locale || typeof i18n.getResource !== 'function') return key

  return i18n.getResource(locale, 'translation', key) === undefined
    ? (REWORDED_KEYS[key as keyof Reworded] as RewordedKey<K>)
    : key
}
