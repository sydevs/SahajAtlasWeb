import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { regionsQuery } from '@/config/api'
import { type RegionMatcher, buildRegionMatcher } from '@/lib/shape'

/**
 * A region-filter predicate over the cache-once `['regions']` tree, or `undefined`
 * when no region is selected — so it drops straight into `matchesFilters`' optional
 * `matchesRegion` argument. The matcher reference only changes when the tree or the
 * selected slug changes (stable across map pan/zoom), so it's safe on the hot path;
 * until the tree loads it's `undefined`, which `matchesFilters` reads as "no region
 * restriction" (the pins/list show unscoped for the one frame before it resolves).
 */
export const useRegionMatcher = (regionSlug: string | null): RegionMatcher | undefined => {
  const { data: regions } = useQuery(regionsQuery())

  return useMemo(() => buildRegionMatcher(regions, regionSlug), [regions, regionSlug])
}
