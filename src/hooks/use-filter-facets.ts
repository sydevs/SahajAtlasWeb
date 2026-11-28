import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'

import { geojsonQuery } from '@/config/api'
import { distanceKm } from '@/lib/geo'
import { useRegionMatcher } from '@/hooks/use-region-matcher'
import { useSearchCountry } from '@/hooks/use-search-country'
import {
  type EventFilters,
  type FilterFacets,
  type FilterableEvent,
  bestRecovery,
  facetCounts,
  hasActiveFilters,
  isNearby,
  isOnline,
  parseCenter,
  scopeFacets,
} from '@/lib/shape'

/**
 * Live counts for the filter form, cut to the scope the visitor is in: a searched place's nearby
 * area plus online classes, by the results list's own rule (`isNearby`), else the selected region,
 * else the whole feed. `undefined` until the feed has loaded, and the form then shows every group
 * but Language, without numbers.
 */
export function useFilterFacets(filters: EventFilters): FilterFacets | undefined {
  const scope = useFilterScope(filters)

  // Judged with nothing picked, so answering one question never removes another from the form.
  const unfiltered = useMemo(() => (scope ? scopeFacets(scope) : undefined), [scope])

  return useMemo(() => {
    if (!scope || !unfiltered) return undefined
    // The region is the scope itself, so filters with only a region picked count as the scope does.
    if (!hasActiveFilters({ ...filters, region: null })) return unfiltered

    const counts = facetCounts(scope, filters)

    return {
      counts,
      relevance: unfiltered.relevance,
      recovery: counts.total === 0 ? bestRecovery(scope, filters) : undefined,
    }
  }, [scope, unfiltered, filters])
}

/**
 * The classes the counts are taken over, uncounted. Cheap beside `useFilterFacets`, so a surface
 * that only needs to know what the scope holds (the filter buttons, closed) reads this instead.
 */
export function useFilterScope(filters: EventFilters): FilterableEvent[] | undefined {
  const [searchParams] = useSearchParams()
  const center = parseCenter(searchParams.get('center'))
  const centerKey = center?.join(',')
  const searchCountry = useSearchCountry()
  const matchesRegion = useRegionMatcher(filters.region)
  const { data: geojson } = useQuery(geojsonQuery())

  return useMemo(() => {
    if (!geojson) return undefined

    return geojson.features.flatMap(({ properties, geometry }) => {
      if (matchesRegion && !matchesRegion(properties)) return []
      if (!center) return [properties]

      const distance =
        isOnline(properties) || !geometry ? undefined : distanceKm(center, geometry.coordinates)

      return isNearby({ ...properties, distance }, searchCountry) ? [properties] : []
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `center` is rebuilt every render, so its string form stands in for it.
  }, [geojson, matchesRegion, centerKey, searchCountry])
}
