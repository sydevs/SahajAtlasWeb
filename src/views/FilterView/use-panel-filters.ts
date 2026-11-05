import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { useAtlasNavigate } from '@/hooks/use-atlas-navigate'
import { useEventFilters } from '@/hooks/use-filters'
import { useFilterFacets } from '@/hooks/use-filter-facets'
import { useMapController } from '@/hooks/use-map-controller'
import {
  DEFAULT_FILTERS,
  type EventFilters,
  type PlaceSearch,
  activeFilterCount,
  filtersToParams,
  noPlaceSearch,
  placeSearchPath,
  viewRegion,
} from '@/lib/shape'

/**
 * Filters edited beside the list rather than in a drawer over it. Every change applies at once.
 * Over a list that doesn't reflect filters (the country list, a region), the first change opens
 * the results, so the list and the map always agree with what's selected.
 */
export function usePanelFilters() {
  const location = useLocation()
  const replace = useNavigate()
  const push = useAtlasNavigate()
  const applied = useEventFilters()
  const { reset } = useMapController()
  const originRegion = viewRegion(location.pathname)
  const filters = useMemo(
    () => ({ ...applied, region: applied.region ?? originRegion }),
    [applied, originRegion],
  )
  const facets = useFilterFacets(filters)
  const params = () => new URLSearchParams(location.search)

  const write = (next: EventFilters, base = params()) => {
    const search = filtersToParams(next, base).toString()

    if (location.pathname === '/search') {
      replace({ pathname: '/search', search }, { replace: true, state: location.state })
    } else {
      push({ pathname: '/search', search })
    }
  }

  return {
    filters,
    facets,
    write,
    count: facets?.counts.total,
    canClear: activeFilterCount({ ...filters, region: null }) > 0,
    /** Clear resets the questions, not the Where: the visitor is still looking in the same place. */
    clear: () => write({ ...DEFAULT_FILTERS, region: filters.region }),
    pickPlace: (place: PlaceSearch) => push(placeSearchPath(params(), place)),
    /** Back to everywhere: the place and the region go, and the other filters stay. */
    clearWhere: () => {
      const rest = { ...filters, region: null }

      reset()
      if (activeFilterCount(rest) === 0) push({ pathname: '/', search: '' })
      else write(rest, new URLSearchParams(noPlaceSearch(params())))
    },
  }
}
