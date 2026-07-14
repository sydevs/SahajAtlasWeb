import { useQuery } from '@tanstack/react-query'

import { IpLocationSchema, type IpLocation } from '@/types'

// A free, keyless IP-geolocation lookup. Deliberately a bare `fetch`, NOT the
// shared axios client (src/config/api/client.ts): that interceptor attaches the
// SahajCloud `Authorization: clients API-Key …` and `locale` to every request, and
// sending those to a third-party host would leak the client API key.
const IP_LOCATION_ENDPOINT = 'https://ipwho.is/'

// Resolve the visitor's approximate location from their IP, or `null` on any
// failure — a network/CSP block, a non-OK response, malformed JSON, or a
// country-only result (no `city` ⇒ the schema rejects). Never throws, so React
// Query treats every outcome as a success and won't retry a blocked lookup.
export async function fetchIpLocation(): Promise<IpLocation | null> {
  try {
    const response = await fetch(IP_LOCATION_ENDPOINT)
    if (!response.ok) return null

    const parsed = IpLocationSchema.safeParse(await response.json())

    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

// One passive lookup per session — `staleTime`/`gcTime: Infinity` keep the single
// result cached and shared across the top-level views, so it never refetches.
// Returns the location or `null` (still loading, or failed); a `null` result means
// the nearby suggestion simply doesn't render.
export function useIpLocation(): IpLocation | null {
  const { data } = useQuery({
    queryKey: ['ip-location'],
    queryFn: fetchIpLocation,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  })

  return data ?? null
}
