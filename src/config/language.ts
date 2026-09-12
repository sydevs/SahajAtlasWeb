import type { TranslationTree } from '@/types'

import i18n from './i18n'
import { preferredLanguage } from './i18n-options'
import { translationsQuery } from './api/fetch'
import { queryClient } from './query-client'

import { LOCALE_PARAM } from '@/lib/shape/locale-param'
import { reportInternalError } from '@/lib/report'

/**
 * This is the locale the boot warm-up fetches, and its whole job is to AGREE with what
 * `applyLanguage` asks for a beat later. A warm-up that fills a different query key pays for a
 * request nobody reads, and the visible flip #168 measured happens anyway.
 *
 * `i18n.language` alone does not agree, which is what this replaces. That is the raw detected
 * tag — `querystring → hostHtmlLang → navigator` — while `AppShell` resolves
 * `pageLocaleOverride(search) ?? defaultLocale ?? i18n.language` through `preferredLanguage`.
 * Two ordinary cases diverge: a host passing `locale="fr"` (an attribute no detector reads, so
 * the browser's tag gets warmed while French is fetched), and a browser reporting `en-US` (which
 * `preferredLanguage` narrows to `en`, so the warmed key is never read on most loads).
 *
 * ⚠ **`availableLocales` has not arrived yet** — it is the other half of the same warm-up — so
 * this cannot run `preferredLanguage`'s narrowing, which takes the offered set. It narrows the
 * one way that needs no set:
 *
 * - **`?locale=` is warmed verbatim.** The widget writes that parameter itself, out of the
 *   offered set (`publishLocale`), so it already names a locale the CMS answers — and
 *   `preferredLanguage` step 1 takes an exact match before any base tag.
 * - **Everything else is base-tagged.** The `locale` attribute and the browser's own preference
 *   are statements about a page or a visitor, not about what an operator published, and a
 *   regional tag from either resolves through step 2 (`de-DE` → `de`).
 *
 * A locale nobody published still misses, as it always did. That costs one speculative prefetch,
 * and `applyLanguage` lands on English regardless.
 */
export function bootLanguage(search: string, defaultLocale?: string | null): string {
  const fromPage = new URLSearchParams(search).get(LOCALE_PARAM)?.trim()

  if (fromPage) return fromPage

  return (defaultLocale?.trim() || i18n.language).split('-')[0]
}

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
 * ⚠ **One writer is not the same as one call at a time**, which is what `generation` below is
 * for. `AppShell`'s effect runs twice by design — once before `sy-atlas-config` lands, with
 * `useLanguages()` still answering `['en']`, then again on the real set — so a `?locale=fr` page
 * issues `applyLanguage('fr', ['en'])` and `applyLanguage('fr', [...])` within a frame. Both
 * await a bundle, and without the counter whichever request settles LAST wins: an English read
 * that came back slow would pin the widget to English under a French `<html lang>`, which is
 * #168's failure reached through one function instead of three.
 *
 * ⚠ **English goes through this path too.** The snapshot in `translations.en.json` is the boot
 * resource and the last-resort fallback, not the final word — the CMS is. Routing `en` through
 * the same fetch-and-add is what lets an English copy edit in SahajCloud reach a live widget
 * without a deploy of this repo.
 */
let generation = 0

export async function applyLanguage(requested: string | null | undefined, available: string[]) {
  const preferred = preferredLanguage(requested, available)
  // Claimed BEFORE the first await, so the ordering this establishes is call order, not
  // settle order. A request that is no longer the newest one applies nothing at all.
  const request = ++generation

  try {
    // A cached bundle applies synchronously, with no await between the read and the change. This
    // is the common case after the first switch, and the case the boot warm-up
    // (`api.warmTranslations`) exists to create: a `?locale=fr` page that fetched French beside
    // `clients/me` reaches this line with the bundle already in the cache, and never paints an
    // English frame.
    const cached = queryClient.getQueryData<TranslationTree>(translationsQuery(preferred).queryKey)

    if (cached) return void applyBundle(preferred, cached)

    const bundle = await queryClient.ensureQueryData(translationsQuery(preferred))

    if (request !== generation) return

    applyBundle(preferred, bundle)
  } catch (error) {
    // A language nobody can read is worse than the wrong language. English is always present as a
    // bundled resource, so this branch always has somewhere to land.
    reportInternalError(error, `translations (${preferred})`)

    // Reported either way — a failed read is worth knowing about whoever asked for it. But a
    // superseded request must not drag the widget back to English: a newer call is already
    // deciding, and its answer is the one the viewer asked for.
    if (request !== generation) return

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
