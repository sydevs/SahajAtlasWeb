import { useMemo } from 'react'

import { useLocale } from '@/hooks/use-locale'

export type LanguageOption = { value: string; label: string }

/** Language codes as picker options, each labelled once in the UI locale and sorted by it. */
export function useLanguageOptions(codes: readonly string[]): LanguageOption[] {
  const { locale, languageLabel } = useLocale()

  return useMemo(() => {
    const collator = new Intl.Collator(locale)

    return codes
      .map((code) => ({ value: code, label: languageLabel(code) }))
      .sort((a, b) => collator.compare(a.label, b.label))
  }, [codes, languageLabel, locale])
}
