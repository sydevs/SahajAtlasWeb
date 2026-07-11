// originally written by @imoaazahmed; reworked to track i18next's active language
// reactively (see #35) so every consumer relocalizes together on a language change.

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

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

  // Just change the language; the subscription above re-snapshots every consumer —
  // no local state to keep in sync.
  const setLocale = useCallback((next: string) => void i18n.changeLanguage(next), [i18n])

  return {
    locale,
    languageCode: locale.split('-')[0],
    languageNames,
    regionNames,
    setLocale,
  }
}
