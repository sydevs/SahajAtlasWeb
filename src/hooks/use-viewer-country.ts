import { useIpLocation } from '@/hooks/use-ip-location'
import { useLocale } from '@/hooks/use-locale'

/**
 * The viewer's country as an ISO alpha-2 code, for region-aware share ordering
 * (`platformsForCountry`). Resolves from the IP-geolocation lookup first, then the
 * active locale's region subtag (e.g. `pt-BR` → `BR`), else `undefined` (which
 * maps to the default platform set).
 *
 * Reads the shared `['ip-location']` cache with `enabled: false` — it piggybacks
 * on the lookup the nearby-events suggestion makes but never triggers it itself,
 * so opening a share sheet never pings the third-party service (and honours the
 * suppression the suggestion applies when dismissed or during an active search).
 * When the lookup hasn't run, the locale subtag / default set cover it at no cost.
 */
export function useViewerCountry(): string | undefined {
  const ip = useIpLocation(false)
  const { locale } = useLocale()

  if (ip?.country_code) return ip.country_code.toUpperCase()

  // Most of our locales are language-only (`en`, `ru`, …) and have no region
  // subtag — those simply fall through to `undefined` → the default set.
  const subtag = locale.split('-')[1]

  return subtag?.length === 2 ? subtag.toUpperCase() : undefined
}
