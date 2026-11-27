import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { useAtlasNavigate } from '@/hooks/use-atlas-navigate'
import { useEventFilters } from '@/hooks/use-filters'
import { useMapController } from '@/hooks/use-map-controller'
import {
  DEFAULT_FILTERS,
  type EventFilters,
  type PlaceSearch,
  clearsBackToPlace,
  filtersToParams,
  hasActiveFilters,
  listsFilteredClasses,
  pageRegion,
  placeSearchPath,
  preserveSearchState,
} from '@/lib/shape'

/**
 * The filters as the buttons over the map edit them: beside the list rather than in a drawer over
 * it, and every tap applies at once. Over a view whose list doesn't reflect filters (the countries,
 * a place page), the first answer opens the results scoped to that place, so the list and the map
 * always agree with what is chosen.
 */
export function usePanelFilters() {
  const location = useLocation()
  const replace = useNavigate()
  const push = useAtlasNavigate()
  const applied = useEventFilters()
  const { reset } = useMapController()
  const originRegion = pageRegion(location.pathname)
  const filters = useMemo(
    () => ({ ...applied, region: applied.region ?? originRegion }),
    [applied, originRegion],
  )
  const params = () => new URLSearchParams(location.search)
  const inPlace = listsFilteredClasses(location.pathname)

  const write = (next: EventFilters, base = params()) => {
    const search = filtersToParams(next, base).toString()

    if (inPlace) {
      replace({ pathname: location.pathname, search }, { replace: true, state: location.state })
    } else {
      push({ pathname: '/search', search })
    }
  }

  return {
    filters,
    write,
    /**
     * Clear resets the questions, not the Where: the visitor is still looking in the same place.
     * Results opened from that place's page go back to it, as if the filters were never touched.
     */
    clear: () =>
      clearsBackToPlace(location, filters.region)
        ? push(-1)
        : write({ ...DEFAULT_FILTERS, region: filters.region }),
    pickPlace: (place: PlaceSearch) => push(placeSearchPath(params(), place)),
    /** Back to everywhere: the place and the region go, and the other answers stay. */
    clearWhere: () => {
      const rest = { ...filters, region: null }
      const onCalendar = location.pathname === '/calendar'

      if (!onCalendar) reset()
      if (!onCalendar && !hasActiveFilters(rest)) push({ pathname: '/', search: '' })
      else write(rest, preserveSearchState(params()))
    },
  }
}
