import type { TranslationTree } from '@/types'

import i18n from './i18n'
import { preferredLanguage } from './i18n-options'
import { translationsQuery } from './api/fetch'
import { queryClient } from './query-client'

import { reportInternalError } from '@/lib/report'

/**
 * This is the ONE writer of i18next's active language. Everything else asks it to switch.
 *
 * PR #168 found why that matters. With `changeLanguage` called from several places — a mount
 * effect, the settings menu, a query-parameter watcher — two of them can disagree within one
 * frame, and the loser wins whichever way the effects happen to order. Worse, each call site
 * then owns its own answer to "has this locale's bundle arrived?", and the ones that forget
 * simply paint English under a French `<html lang>`.
 *
 * So there are exactly two callers: `AppShell`'s language effect, and `useLocale().setLocale`.
 * Both hand a REQUEST here and get a promise back; neither decides anything else.
 *
 * ⚠ **English goes through this path too.** The snapshot in `translations.en.json` is the boot
 * resource and the last-resort fallback, not the final word — the CMS is. Routing `en` through
 * the same fetch-and-add is what lets an English copy edit in SahajCloud reach a live widget
 * without a deploy of this repo.
 */
export async function applyLanguage(requested: string | null | undefined, available: string[]) {
  const preferred = preferredLanguage(requested, available)

  try {
    // A cached bundle applies synchronously, with no await between the read and the change. This
    // is the common case after the first switch, and the case the boot warm-up
    // (`api.warmTranslations`) exists to create: a `?locale=fr` page that fetched French beside
    // `clients/me` reaches this line with the bundle already in the cache, and never paints an
    // English frame.
    const cached = queryClient.getQueryData<TranslationTree>(translationsQuery(preferred).queryKey)

    if (cached) return void applyBundle(preferred, cached)

    const bundle = await queryClient.ensureQueryData(translationsQuery(preferred))

    applyBundle(preferred, bundle)
  } catch (error) {
    // A language nobody can read is worse than the wrong language. English is always present as a
    // bundled resource, so this branch always has somewhere to land.
    reportInternalError(error, `translations (${preferred})`)

    await i18n.changeLanguage('en')
  }
}

// `deep` and `overwrite` are both true: a CMS bundle REPLACES what is held for that locale rather
// than merging under it. For `en` that is the point — the snapshot is a floor, and a key the CMS
// has since reworded must win over the copy compiled in at build time.
const applyBundle = (locale: string, bundle: TranslationTree) => {
  i18n.addResourceBundle(locale, 'translation', bundle, true, true)

  return i18n.changeLanguage(locale)
}
