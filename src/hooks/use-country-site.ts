import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'

import api, { regionsQuery } from '@/config/api'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import { useEventFilters } from '@/hooks/use-filters'
import { countrySite } from '@/lib/country-sites'
import {
  SEARCH_COUNTRY_PARAM,
  countryHasPrograms,
  hasActiveFilters,
  isoCountryCode,
} from '@/lib/shape'

/** The country whose own website to offer, ready to hand to `CountrySiteOffer`. */
export type CountrySite = { countryCode: string; href: string }

/**
 * The national website to offer for the searched country, or `undefined` — the whole
 * trigger for the country-website empty state (issue #82), composed in one place so
 * the empty state itself stays presentational (mirrors `useRegionMatcher`, which
 * composes the same `['regions']` read with a pure `@/lib/shape` predicate).
 *
 * Resolves only when all of these hold:
 *
 *  1. the search carries a country (`?cc`, written by the geocoder field / accepted IP
 *     suggestion — so this is inert on every surface but `/search`);
 *  2. that country is one of the 95 with a site;
 *  3. it lists **zero** programs in the full feed — genuinely absent, not filtered out;
 *  4. **no filter is active.** An empty list under active filters is explained by the
 *     filters, and that state owns the "clear all" escape hatch — so the offer waits
 *     until the filters are cleared rather than replacing it. This also keeps a
 *     *region* filter from producing a nonsense offer: it re-points the query at
 *     another place entirely, so `?cc` no longer describes what came back empty.
 *
 * Both cache-once reads are warmed at bootstrap (`api.warmCaches`) and already have
 * ungated observers on this screen (`ActiveFilterPills`, `GeolocationSuggestion`), so
 * this adds no request. They're required to be *loaded* before answering: a cache miss
 * must never read as a confirmed-empty country, which would offer a foreign website to
 * someone whose country does have classes.
 */
export const useCountrySite = (): CountrySite | undefined => {
  const [searchParams] = useSearchParams()
  const filters = useEventFilters()
  const countryCode = isoCountryCode(searchParams.get(SEARCH_COUNTRY_PARAM))
  const href = countrySite(countryCode)

  const { data: regions } = useQuery(regionsQuery())
  const { data: geojson } = useQuery({
    queryKey: ['geojson'],
    queryFn: () => api.getGeojson(),
    staleTime: GEOJSON_STALE_TIME,
  })

  // Memoized because the feed scan builds a region index + subtree set, and this
  // renders under a URL that churns: the geocoder field rewrites `?q` on every
  // keystroke, so an unmemoized scan would rebuild the whole index per character.
  return useMemo(() => {
    if (!countryCode || !href || !regions || !geojson) return undefined
    if (hasActiveFilters(filters)) return undefined

    return countryHasPrograms(regions, geojson.features, countryCode)
      ? undefined
      : { countryCode, href }
  }, [countryCode, href, regions, geojson, filters])
}
