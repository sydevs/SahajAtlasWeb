import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'

import { geojsonQuery } from '@/config/api'
import { distanceKm } from '@/lib/geo'
import { useRegionMatcher } from '@/hooks/use-region-matcher'
import {
  DEFAULT_FILTERS,
  FOREIGN_NEARBY_KM,
  SEARCH_COUNTRY_PARAM,
  type EventFilters,
  type FacetCounts,
  type FacetRelevance,
  NEARBY_KM,
  facetCounts,
  facetRelevance,
  isoCountryCode,
  parseCenter,
} from '@/lib/shape'

export type FilterFacets = {
  counts: FacetCounts
  relevance: FacetRelevance
}

/**
 * Live counts for the filter form, cut to the scope the visitor is in: a searched place's nearby
 * area plus online classes (what the results list opens with), else the selected region, else
 * the whole feed. `undefined` until the feed has loaded, and the form then shows every group
 * without numbers.
 */
export function useFilterFacets(filters: EventFilters): FilterFacets | undefined {
  const [searchParams] = useSearchParams()
  const center = parseCenter(searchParams.get('center'))
  const centerKey = center?.join(',')
  const searchCountry = isoCountryCode(searchParams.get(SEARCH_COUNTRY_PARAM))
  const matchesRegion = useRegionMatcher(filters.region)
  const { data: geojson } = useQuery(geojsonQuery())

  const scope = useMemo(() => {
    if (!geojson) return undefined

    return geojson.features
      .filter((feature) => {
        if (matchesRegion && !matchesRegion(feature.properties)) return false
        if (!center || feature.properties.eventType === 'online') return true
        if (!feature.geometry) return false

        // The list's own nearby rule, half the limit across a border (`revealRows`), so the count
        // on Apply is the number of rows the list opens with.
        const country = isoCountryCode(feature.properties.address?.country)
        const limit =
          searchCountry && country && country !== searchCountry ? FOREIGN_NEARBY_KM : NEARBY_KM

        return distanceKm(center, feature.geometry.coordinates) <= limit
      })
      .map((feature) => feature.properties)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `center` is rebuilt every render, so its string form stands in for it.
  }, [geojson, matchesRegion, centerKey, searchCountry])

  // Judged with nothing picked, so answering one question never removes another from the form.
  const relevance = useMemo(
    () => (scope ? facetRelevance(facetCounts(scope, DEFAULT_FILTERS)) : undefined),
    [scope],
  )

  return useMemo(
    () => (scope && relevance ? { counts: facetCounts(scope, filters), relevance } : undefined),
    [scope, relevance, filters],
  )
}
