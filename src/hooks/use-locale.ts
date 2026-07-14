// originally written by @imoaazahmed; reworked to track i18next's active language
// reactively (see #35) so every consumer relocalizes together on a language change.

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { toSahajLocale } from '@/config/api/client'

export function useLocale() {
  const { i18n } = useTranslation()

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

  const languageNames = useMemo(() => new Intl.DisplayNames(locale, { type: 'language' }), [locale])
  const regionNames = useMemo(() => new Intl.DisplayNames(locale, { type: 'region' }), [locale])

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
    locale,
    languageCode: locale.split('-')[0],
    // The SahajCloud locale bucket the server localizes to (what the interceptor
    // sends). Locale-dependent query keys use this so a language switch re-keys and
    // pt-BR/en-US collapse onto their canonical bucket.
    sahajLocale: toSahajLocale(locale),
    languageNames,
    languageLabel,
    regionNames,
    setLocale,
  }
}
