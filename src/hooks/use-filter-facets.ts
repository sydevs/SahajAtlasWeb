import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'

import api from '@/config/api'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import { distanceKm } from '@/lib/geo'
import { useRegionMatcher } from '@/hooks/use-region-matcher'
import {
  DEFAULT_FILTERS,
  FOREIGN_NEARBY_KM,
  SEARCH_COUNTRY_PARAM,
  type EventFilters,
  type FacetCounts,
  type FacetRelevance,
  type FilterRecovery,
  bestRecovery,
  NEARBY_KM,
  facetCounts,
  facetRelevance,
  isoCountryCode,
  parseCenter,
} from '@/lib/shape'

export type FilterFacets = {
  counts: FacetCounts
  relevance: FacetRelevance
  /** Set only when nothing matches: the one change that helps most. */
  recovery?: FilterRecovery | null
}

/**
 * Live counts for the filter form, cut to the scope the visitor is in: a searched place's nearby
 * area plus online classes (what the results list opens with), else the selected region, else
 * the whole feed. `undefined` until the feed has loaded, and the form then simply shows every
 * group without numbers.
 */
export function useFilterFacets(filters: EventFilters): FilterFacets | undefined {
  const [searchParams] = useSearchParams()
  const center = parseCenter(searchParams.get('center'))
  const centerKey = center?.join(',')
  const searchCountry = isoCountryCode(searchParams.get(SEARCH_COUNTRY_PARAM))
  const matchesRegion = useRegionMatcher(filters.region)
  const { data: geojson } = useQuery({
    queryKey: ['geojson'],
    queryFn: () => api.getGeojson(),
    staleTime: GEOJSON_STALE_TIME,
  })

  const scope = useMemo(() => {
    if (!geojson) return undefined

    return geojson.features
      .filter((feature) => {
        if (matchesRegion && !matchesRegion(feature.properties)) return false
        if (!center || feature.properties.eventType === 'online') return true

        if (!feature.geometry) return false

        // The list's own nearby rule: half the limit across a border (see `revealRows`), so the
        // number on the button is the number of rows the list opens with.
        const country = isoCountryCode(feature.properties.address?.country)
        const limit =
          searchCountry && country && country !== searchCountry ? FOREIGN_NEARBY_KM : NEARBY_KM

        return distanceKm(center, feature.geometry.coordinates) <= limit
      })
      .map((feature) => feature.properties)
    // `center` is rebuilt every render, so its string form is the dependency.
  }, [geojson, matchesRegion, centerKey, searchCountry])

  const relevance = useMemo(
    () => (scope ? facetRelevance(facetCounts(scope, DEFAULT_FILTERS)) : undefined),
    [scope],
  )

  return useMemo(() => {
    if (!scope || !relevance) return undefined

    const counts = facetCounts(scope, filters)

    return {
      counts,
      relevance,
      recovery: counts.total === 0 ? bestRecovery(scope, filters) : null,
    }
  }, [scope, relevance, filters])
}
