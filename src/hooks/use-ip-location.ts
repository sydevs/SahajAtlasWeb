import { useQuery } from '@tanstack/react-query'

import { IpLocationSchema, type IpLocation } from '@/types'

// A free, keyless IP-geolocation lookup. Deliberately a bare `fetch`, NOT the
// shared SahajCloud client (src/config/api/client.ts): `applyRequestContext` attaches
// the SahajCloud `Authorization: clients API-Key …` and `locale` to every request, and
// sending those to a third-party host would leak the client API key.
const IP_LOCATION_ENDPOINT = 'https://ipwho.is/'

// Resolve the visitor's approximate location from their IP, or `null` on any
// failure — a network/CSP block, a non-OK response, malformed JSON, or a
// country-only result (no `city` ⇒ the schema rejects). Never throws, so React
// Query treats every outcome as a success and won't retry a blocked lookup.
export async function fetchIpLocation(): Promise<IpLocation | null> {
  try {
    const response = await fetch(IP_LOCATION_ENDPOINT, {
      // Don't leak the embedding host's origin to the third party, and don't let a
      // slow/hanging response hold the request open — the catch maps abort → null.
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

// One passive lookup per session — `staleTime`/`gcTime: Infinity` keep the single
// result cached and shared across the top-level views, so it never refetches.
// Pass `enabled: false` to skip the lookup entirely (e.g. the suggestion is already
// dismissed) so a dismissed session never pings the third-party service. Returns the
// location or `null` (loading, disabled, or failed) — a `null` result means the
// nearby suggestion simply doesn't render.
//
// There is no host opt-out (#149). The lookup is a convenience — the nearby suggestion and
// the localized online-event time — never a prerequisite, and `enabled` already lets each
// caller decline it. Note for anyone revisiting this: an IP is personal data in the EU and
// the visitor is on the HOST's page, so if a host ever needs to refuse this flow, the answer
// is a client-record setting rather than a script parameter — the embed URL is not where
// somebody else's compliance posture should live.
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
