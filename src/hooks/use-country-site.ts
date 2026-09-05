import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import api, { regionsQuery } from '@/config/api'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import { useEventFilters } from '@/hooks/use-filters'
import { useSearchCountry } from '@/hooks/use-search-country'
import { countrySite } from '@/lib/country-sites'
import { countryHasPrograms, hasActiveFilters } from '@/lib/shape'

/** This is the country whose own website to offer, ready to become a `country-site` recovery
 *  rung on the events list's empty state, `FallbackPanel`. */
export type CountrySite = { countryCode: string; href: string }

/**
 * This returns the national website to offer for the searched country, or `undefined`.
 * It is the whole trigger for the country-website empty state, issue #82, composed in one place so the empty state itself stays presentational.
 * This mirrors `useRegionMatcher`, which composes the same `['regions']` read with a pure `@/lib/shape` predicate.
 *
 * This resolves only when all of these hold:
 *
 *  1. The search carries a country, `?cc`, written by the geocoder field or an accepted IP suggestion. So this is inert on every surface but `/search`.
 *  2. That country is one of the 95 with a site.
 *  3. It lists ZERO programs in the full feed. It is genuinely absent, not filtered out.
 *  4. NO filter is active. An empty list under active filters is explained by the filters, and that state owns the "clear all" escape hatch.
 *     So the offer waits until the filters clear, instead of replacing that escape hatch.
 *     This also keeps a REGION filter from producing a nonsense offer. That filter re-points the query at another place entirely, so `?cc` no longer describes what came back empty.
 *
 * Both cache-once reads warm at bootstrap, through `api.warmCaches`, and they already have ungated observers on this screen, `ActiveFilterPills` and `GeolocationSuggestion`.
 * So this adds no request.
 * They must be LOADED before this answers.
 * A cache miss must never read as a confirmed-empty country, which would offer a foreign website to someone whose country does have classes.
 */
export const useCountrySite = (): CountrySite | undefined => {
  const filters = useEventFilters()
  const countryCode = useSearchCountry()
  const href = countrySite(countryCode)

  const { data: regions } = useQuery(regionsQuery())
  const { data: geojson } = useQuery({
    queryKey: ['geojson'],
    queryFn: () => api.getGeojson(),
    staleTime: GEOJSON_STALE_TIME,
  })

  // This is memoized because the feed scan builds a region index and a subtree set.
  // This renders under a URL that churns. The geocoder field rewrites `?q` on every keystroke.
  // So an unmemoized scan would rebuild the whole index per character.
  return useMemo(() => {
    if (!countryCode || !href || !regions || !geojson) return undefined
    if (hasActiveFilters(filters)) return undefined

    return countryHasPrograms(regions, geojson.features, countryCode)
      ? undefined
      : { countryCode, href }
  }, [countryCode, href, regions, geojson, filters])
}
