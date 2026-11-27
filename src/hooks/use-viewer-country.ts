import { useApproxLocation } from '@/config/store'
import { useLocale } from '@/hooks/use-locale'
import { isoCountryCode } from '@/lib/shape'

/**
 * The viewer's country as an ISO alpha-2 code: the approximate location's country first, then
 * the active locale's region subtag (`pt-BR` → `BR`), else `undefined`. Most of our locales are
 * language-only (`en`, `ru`), so the subtag rarely answers.
 */
export function useViewerCountry(): string | undefined {
  const countryCode = useApproxLocation((s) => s.location?.countryCode)
  const { locale } = useLocale()

  return countryCode ?? isoCountryCode(locale.split('-')[1])
}
