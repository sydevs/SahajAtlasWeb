import { useMemo } from 'react'

import { useLocale } from '@/hooks/use-locale'

export type LanguageOption = { code: string; label: string }

/** Language codes, each labelled once in the UI locale and sorted by that label. */
export function useLanguageOptions(codes: readonly string[]): LanguageOption[] {
  const { locale, languageLabel } = useLocale()

  return useMemo(() => {
    const collator = new Intl.Collator(locale)

    return codes
      .map((code) => ({ code, label: languageLabel(code) }))
      .sort((a, b) => collator.compare(a.label, b.label))
  }, [codes, languageLabel, locale])
}
