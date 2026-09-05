// @imoaazahmed originally wrote this file.
// This version reworks it to track i18next's active language reactively. See #35.
// So every consumer relocalizes together on a language change.

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

// This holds one `Intl.DisplayNames` per locale and type, for the widget's lifetime.
// This is keyed here, not held in a component memo, because every list card calls `useLocale`.
// A deep results list would otherwise construct a pair per row.
// This cache stays bounded by the locale count.
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
 * This returns a language's name IN ITSELF: "English," "français," "русский," for the picker that offers it.
 *
 * The whole point of the language menu is to be usable by someone who cannot read the language currently on screen.
 * A list rendered through the ACTIVE locale defeats exactly that.
 * A French visitor looking for English was offered "anglais," and a Russian visitor "английский."
 * The name has to be in the language it names, so the row is legible to the person who wants it.
 *
 * This builds the name with the code as BOTH arguments, the display locale and the subject. That is what makes the label an endonym.
 * This goes through the same module cache as everything else here.
 * So offering ten languages costs ten `Intl.DisplayNames` instances for the widget's lifetime, not ten per render of the menu.
 *
 * ⚠ This does not replace `languageLabel` below.
 * That function names an EVENT's language inside a filter, where the reader is reading the current UI language, and "Russian" is the right word.
 * This function names a language to someone about to switch to it.
 */
export const nativeLanguageLabel = (code: string): string => {
  try {
    return displayNames(code, 'language').of(code) ?? code
  } catch {
    // `Intl.DisplayNames` throws on a malformed code. Both its constructor and its `.of` method can throw.
    return code
  }
}

export function useLocale() {
  // This hands back `t` alongside the locale, because this hook already holds it.
  // A caller that needs both would otherwise call `useTranslation` a second time on the same component.
  // That would double the i18next subscription, and its per-render `getFixedT`, for a value the first call could have returned.
  const { t, i18n } = useTranslation()

  // This subscribes to i18next's `languageChanged` event, so every consumer re-reads the active language at once.
  // The old local `useState` only updated for the instance whose own `setLocale` ran.
  // That left other consumers, such as `CountriesView`'s `regionNames`, on a stale locale until they remounted, since their `Intl.DisplayNames` never rebuilt.
  const subscribe = useCallback(
    (onChange: () => void) => {
      i18n.on('languageChanged', onChange)

      return () => i18n.off('languageChanged', onChange)
    },
    [i18n],
  )
  const getSnapshot = useCallback(() => i18n.resolvedLanguage || 'en', [i18n])
  const locale = useSyncExternalStore(subscribe, getSnapshot, () => 'en')

  // This caches per locale at module scope, not per hook instance.
  // `useMemo` is scoped to the component, so a long results list, up to `MAX_REVEAL` rows, each card calling this, held one pair of ICU objects per row.
  // Constructing `Intl.DisplayNames` is not cheap, and the result depends on nothing but the locale.
  // So there only ever needs to be one pair per language, for the widget's lifetime.
  // This mirrors how `formatDistance` already caches its `Intl.NumberFormat` instances.
  const languageNames = useMemo(() => displayNames(locale, 'language'), [locale])
  const regionNames = useMemo(() => displayNames(locale, 'region'), [locale])

  // This is a guarded language-name lookup.
  // `Intl.DisplayNames.of` throws on a malformed code, so this falls back to the raw code.
  // The filter form and the active-filter pills use this.
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

  // This just changes the language.
  // The subscription above re-snapshots every consumer, so there is no local state to keep in sync.
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
