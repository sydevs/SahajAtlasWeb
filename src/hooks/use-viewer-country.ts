import { useIpLocation } from '@/hooks/use-ip-location'
import { useLocale } from '@/hooks/use-locale'
import { isoCountryCode } from '@/lib/shape'

/**
 * This returns the viewer's country as an ISO alpha-2 code, for region-aware share ordering, `platformsForCountry`.
 * This resolves from the IP-geolocation lookup first.
 * It then tries the active locale's region subtag, such as `pt-BR` mapping to `BR`.
 * Otherwise it returns `undefined`, which maps to the default platform set.
 *
 * This reads the shared `['ip-location']` cache with `enabled: false`.
 * It piggybacks on the lookup the nearby-events suggestion makes, but never triggers that lookup itself.
 * So opening a share sheet never pings the third-party service.
 * This also honors the suppression the suggestion applies when dismissed or during an active search.
 * When the lookup has not run, the locale subtag or default set covers it at no cost.
 */
export function useViewerCountry(): string | undefined {
  const ip = useIpLocation(false)
  const { locale } = useLocale()

  // Both sources go through the shared `isoCountryCode` guard.
  // So anything that is not a canonical alpha-2 code falls through to the default platform set, instead of becoming a bogus "country code."
  // The IP code is already length-checked at the zod boundary, `IpLocationSchema`.
  // So this only tightens it to LETTERS.
  // The belt-and-braces value is having one guard for both sources.
  // Most of our locales are language-only, such as `en` or `ru`, with no region subtag at all.
  // So they resolve to the default too.
  return isoCountryCode(ip?.country_code) ?? isoCountryCode(locale.split('-')[1])
}
