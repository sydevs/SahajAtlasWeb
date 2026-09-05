import { useQuery } from '@tanstack/react-query'

import { IpLocationSchema, type IpLocation } from '@/types'

// This is a free, keyless IP-geolocation lookup.
// This deliberately uses a bare `fetch`, NOT the shared SahajCloud client, `src/config/api/client.ts`.
// `applyRequestContext` attaches the SahajCloud `Authorization: clients API-Key …` header and `locale` to every request.
// Sending those to a third-party host would leak the client API key.
const IP_LOCATION_ENDPOINT = 'https://ipwho.is/'

// This resolves the visitor's approximate location from their IP, or `null` on any failure.
// A failure can be a network or CSP block, a non-OK response, malformed JSON, or a country-only result. A missing `city` makes the schema reject the result.
// This never throws.
// So React Query treats every outcome as a success, and never retries a blocked lookup.
export async function fetchIpLocation(): Promise<IpLocation | null> {
  try {
    const response = await fetch(IP_LOCATION_ENDPOINT, {
      // This never leaks the embedding host's origin to the third party.
      // It also never lets a slow or hanging response hold the request open. The catch maps an abort to `null`.
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) return null

    const parsed = IpLocationSchema.safeParse(await response.json())

    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

// This is one passive lookup per session.
// `staleTime` and `gcTime` at `Infinity` keep the single result cached and shared across the top-level views, so it never refetches.
// Pass `enabled: false` to skip the lookup entirely, such as when the suggestion is already dismissed.
// So a dismissed session never pings the third-party service.
// This returns the location, or `null` while loading, disabled, or failed.
// A `null` result means the nearby suggestion simply does not render.
//
// There is no host opt-out. See #149.
// The lookup is a convenience, for the nearby suggestion and the localized online-event time. It is never a prerequisite.
// `enabled` already lets each caller decline it.
// Note for anyone revisiting this: an IP is personal data in the EU, and the visitor is on the HOST's page.
// If a host ever needs to refuse this flow, the answer is a client-record setting, not a script parameter.
// The embed URL is not where somebody else's compliance posture should live.
export function useIpLocation(enabled = true): IpLocation | null {
  const { data } = useQuery({
    queryKey: ['ip-location'],
    queryFn: fetchIpLocation,
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  return data ?? null
}
