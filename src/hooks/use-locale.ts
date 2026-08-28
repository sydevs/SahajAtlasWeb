// originally written by @imoaazahmed; reworked to track i18next's active language
// reactively (see #35) so every consumer relocalizes together on a language change.

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

// One `Intl.DisplayNames` per (locale, type) for the widget's lifetime. Keyed rather
// than held in a component memo because every list card calls `useLocale`, so a deep
// results list would otherwise construct a pair per row. Bounded by the locale count.
const displayNamesCache = new Map<string, Intl.DisplayNames>()

const displayNames = (locale: string, type: 'language' | 'region'): Intl.DisplayNames => {
  const key = `${locale}:${type}`
  const cached = displayNamesCache.get(key)

  if (cached) return cached

  const created = new Intl.DisplayNames(locale, { type })

  displayNamesCache.set(key, created)

  return created
}

/**
 * A language's name IN ITSELF — "English", "français", "русский" — for the picker that offers it.
 *
 * The whole point of the language menu is to be usable by someone who cannot read the language
 * currently on screen, and a list rendered through the ACTIVE locale defeats exactly that: a
 * French visitor looking for English was offered "anglais", and a Russian one "английский". The
 * name has to be in the language it names, so the row is legible to the person who wants it.
 *
 * Built with the code as BOTH arguments — the display locale and the subject — which is what
 * makes the label an endonym. Goes through the same module cache as everything else here, so
 * offering ten languages costs ten `Intl.DisplayNames` for the widget's lifetime, not ten per
 * render of the menu.
 *
 * ⚠ Not a replacement for `languageLabel` below. That one names an EVENT's language inside a
 * filter, where the reader is reading the current UI language and "Russian" is the right word;
 * this one names a language to someone about to switch to it.
 */
export const nativeLanguageLabel = (code: string): string => {
  try {
    return displayNames(code, 'language').of(code) ?? code
  } catch {
    // `Intl.DisplayNames` throws on a malformed code, and both its constructor and `.of` can.
    return code
  }
}

export function useLocale() {
  // `t` is handed back alongside the locale because this hook already holds it: a caller
  // that needs both would otherwise call `useTranslation` a second time on the same
  // component, doubling the i18next subscription (and its per-render `getFixedT`) for a
  // string the first call could have returned.
  const { t, i18n } = useTranslation()

  // Subscribe to i18next's `languageChanged` so every consumer re-reads the active
  // language at once. The old local useState only updated for the instance whose
  // own setLocale ran, leaving other consumers (e.g. CountriesView's regionNames)
  // on a stale locale — their Intl.DisplayNames never rebuilt — until they remounted.
  const subscribe = useCallback(
    (onChange: () => void) => {
      i18n.on('languageChanged', onChange)

      return () => i18n.off('languageChanged', onChange)
    },
    [i18n],
  )
  const getSnapshot = useCallback(() => i18n.resolvedLanguage || 'en', [i18n])
  const locale = useSyncExternalStore(subscribe, getSnapshot, () => 'en')

  // Module-cached per locale, not per hook instance: `useMemo` is scoped to the
  // component, so a long results list (up to MAX_REVEAL rows, each card calling this)
  // held one pair of ICU objects per row. Constructing `Intl.DisplayNames` is not cheap
  // and the result depends on nothing but the locale, so there only ever need be one
  // pair per language for the widget's lifetime. Mirrors how `formatDistance` already
  // caches its `Intl.NumberFormat`s.
  const languageNames = useMemo(() => displayNames(locale, 'language'), [locale])
  const regionNames = useMemo(() => displayNames(locale, 'region'), [locale])

  // Guarded language-name lookup: `Intl.DisplayNames.of` throws on a malformed
  // code, so fall back to the raw code. Used by the filter form + active-filter pills.
  const languageLabel = useCallback(
    (code: string) => {
      try {
        return languageNames.of(code) ?? code
      } catch {
        return code
      }
    },
    [languageNames],
  )

  // Just change the language; the subscription above re-snapshots every consumer —
  // no local state to keep in sync.
  const setLocale = useCallback((next: string) => void i18n.changeLanguage(next), [i18n])

  return {
    t,
    locale,
    languageCode: locale.split('-')[0],
    languageNames,
    languageLabel,
    regionNames,
    setLocale,
  }
}
