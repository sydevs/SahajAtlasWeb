import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { regionsQuery } from '@/config/api'
import { type RegionMatcher, buildRegionMatcher } from '@/lib/shape'

/**
 * This returns a region-filter predicate over the cache-once `['regions']` tree, or `undefined` when no region is selected.
 * So it drops straight into `matchesFilters`' optional `matchesRegion` argument.
 * The matcher reference only changes when the tree or the selected slug changes, stable across map pan and zoom, so it is safe on the hot path.
 * Until the tree loads, this is `undefined`, which `matchesFilters` reads as "no region restriction."
 * The pins and list show unscoped for the one frame before it resolves.
 */
export const useRegionMatcher = (regionSlug: string | null): RegionMatcher | undefined => {
  const { data: regions } = useQuery(regionsQuery())

  return useMemo(() => buildRegionMatcher(regions, regionSlug), [regions, regionSlug])
}
