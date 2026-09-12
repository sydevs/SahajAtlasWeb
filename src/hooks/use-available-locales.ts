import type { AtlasConfig } from '@/types'

import { useQuery } from '@tanstack/react-query'

import { atlasConfigQuery } from '@/config/api/fetch'
import { queryClient } from '@/config/query-client'

// Both module-local: this file answers the set two ways, and `localesFrom` is what stops the two
// from disagreeing. Neither is a second way for a caller to ask — there are exactly two of those,
// `useAvailableLocales` for a render and `currentLocales` for an event handler.
/** English alone, which is what the widget offers whenever the set cannot be proven. */
const FALLBACK_LOCALES = ['en']

const localesFrom = (config: AtlasConfig | undefined): string[] => {
  const offered = config?.availableLocales?.filter((locale) => locale.trim() !== '')

  return offered?.length ? offered : FALLBACK_LOCALES
}

/**
 * The same answer, read imperatively out of the cache.
 *
 * `useLocale` is called by every list card, so subscribing it to the config query would put one
 * observer per row on a key whose value changes at most once a session. The set is warmed at boot
 * and only read here inside an event handler — the viewer picking a language from a menu the hook
 * below rendered, which means the data is already there.
 */
export const currentLocales = (): string[] =>
  localesFrom(queryClient.getQueryData<AtlasConfig>(atlasConfigQuery().queryKey))

/**
 * This is the set of languages the widget offers, as an operator chose it.
 *
 * `sy-atlas-config.availableLocales` is not a wish list: SahajCloud refuses to save a locale there
 * until that locale's translations are PUBLISHED (sydevs/SahajCloud#705). So the picker can render
 * it verbatim, and a row it shows is a row that leads somewhere.
 *
 * ⚠ **Anything unusable becomes `['en']`, never a guess.** A failed read, an empty array, a record
 * saved before the field existed — each one means the same thing here: we cannot prove any other
 * language is published. Offering one anyway would put a row in the menu that answers with English
 * when clicked, which is a worse experience than a menu with one row. And the failure is not
 * isolated: a CMS that cannot answer this cannot have answered `clients/me` either, so by the time
 * this matters the viewer is already looking at the error fallback.
 *
 * This is a plain `useQuery`, not a suspense read. The language picker is chrome — it must never
 * hold up the interface, and a widget with one language in its menu still works perfectly.
 */
export function useAvailableLocales(): string[] {
  const { data } = useQuery(atlasConfigQuery())

  return localesFrom(data)
}
