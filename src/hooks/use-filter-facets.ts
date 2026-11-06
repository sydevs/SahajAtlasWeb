import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'

import api from '@/config/api'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import { usePlaceScope } from '@/hooks/use-place-scope'
import { useRegionMatcher } from '@/hooks/use-region-matcher'
import {
  DEFAULT_FILTERS,
  EXCLUDE_EVENT_PARAM,
  type EventFilters,
  type FacetCounts,
  type FacetRelevance,
  type FilterRecovery,
  bestRecovery,
  facetCounts,
  facetRelevance,
  facetScope,
  parseBounds,
  parseCenter,
} from '@/lib/shape'

export type FilterFacets = {
  counts: FacetCounts
  relevance: FacetRelevance
  /** Set only when nothing matches: the one change that helps most. */
  recovery?: FilterRecovery | null
}

/**
 * Live counts for the filter form, cut to the scope the visitor is in: around a searched place,
 * exactly the classes the results list counts in full (`localResults` — the same split the list
 * groups by, less the class a "see alternatives" search leaves out), else the selected region,
 * else the whole feed. `undefined` until the feed has loaded, and the form then simply shows every
 * group without numbers.
 */
export function useFilterFacets(filters: EventFilters): FilterFacets | undefined {
  const [searchParams] = useSearchParams()
  const center = parseCenter(searchParams.get('center'))
  const centerKey = center?.join(',')
  const excluded = Number(searchParams.get(EXCLUDE_EVENT_PARAM))
  const scope = usePlaceScope(center, parseBounds(searchParams.get('bbox')))
  const matchesRegion = useRegionMatcher(filters.region)
  const { data: geojson } = useQuery({
    queryKey: ['geojson'],
    queryFn: () => api.getGeojson(),
    staleTime: GEOJSON_STALE_TIME,
  })

  // `center` is rebuilt every render, so its string form is the dependency.
  const scoped = useMemo(
    () =>
      geojson
        ? facetScope(geojson.features, { center, place: scope, excluded, matchesRegion })
        : undefined,
    [geojson, matchesRegion, excluded, centerKey, scope],
  )

  const relevance = useMemo(
    () =>
      scoped
        ? facetRelevance(facetCounts(scoped.events, DEFAULT_FILTERS, undefined, scoped.shownOf))
        : undefined,
    [scoped],
  )

  return useMemo(() => {
    if (!scoped || !relevance) return undefined

    const { events, shownOf } = scoped
    const counts = facetCounts(events, filters, undefined, shownOf)

    return {
      counts,
      relevance,
      recovery: counts.total === 0 ? bestRecovery(events, filters, undefined, shownOf) : null,
    }
  }, [scoped, relevance, filters])
}
