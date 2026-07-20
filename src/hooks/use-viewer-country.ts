import { useIpLocation } from '@/hooks/use-ip-location'
import { useLocale } from '@/hooks/use-locale'

/**
 * The viewer's country as an ISO alpha-2 code, for region-aware share ordering
 * (`platformsForCountry`). Resolves from the passive IP-geolocation lookup first,
 * then the active locale's region subtag (e.g. `pt-BR` → `BR`), else `undefined`
 * (which maps to the default platform set). It reuses the single cached
 * `['ip-location']` query, so it adds no network cost beyond the lookup the
 * nearby-events suggestion already makes.
 */
export function useViewerCountry(): string | undefined {
  const ip = useIpLocation()
  const { locale } = useLocale()

  if (ip?.country_code) return ip.country_code.toUpperCase()

  // Most of our locales are language-only (`en`, `ru`, …) and have no region
  // subtag — those simply fall through to `undefined` → the default set.
  const subtag = locale.split('-')[1]

  return subtag?.length === 2 ? subtag.toUpperCase() : undefined
}
