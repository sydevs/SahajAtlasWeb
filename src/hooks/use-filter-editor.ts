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
  noPlaceSearch,
  pageRegion,
  parentOf,
  placeFiltersPath,
  placeSearchPath,
  preserveSearchState,
} from '@/lib/shape'

/**
 * Which surface edits the filters: the `drawer` over a page (`<page>/filters`), or the `buttons`
 * beside the list on a computer. Both write the URL on every tap; they differ only in where an
 * answer lands, since the drawer is a page of its own and the buttons are not.
 */
export type FilterSurface = 'drawer' | 'buttons'

/**
 * The one reader and writer of the filters a visitor edits. Over a place page the filters are
 * scoped to that place without saying so in the URL, so an untouched `/gb/filters` still reads as
 * nothing chosen.
 */
export function useFilterEditor(surface: FilterSurface) {
  const location = useLocation()
  const navigate = useNavigate()
  const push = useAtlasNavigate()
  const { reset } = useMapController()
  const applied = useEventFilters()
  const originRegion = pageRegion(location.pathname)
  const filters = useMemo(
    () => ({ ...applied, region: applied.region ?? originRegion }),
    [applied, originRegion],
  )
  const params = () => new URLSearchParams(location.search)
  const replace = (to: { pathname: string; search: string } | string) =>
    navigate(to, { replace: true, state: location.state })

  // The drawer, and the buttons over a list that shows filtered classes, stay where they are.
  // Elsewhere (the countries, a place page) the buttons open the results, so the list and the
  // map agree with what is chosen.
  const stays = surface === 'drawer' || listsFilteredClasses(location.pathname)

  const write = (next: EventFilters, base = params()) => {
    if (!stays) {
      push({ pathname: '/search', search: filtersToParams(next, base).toString() })

      return
    }
    // A page's own place is implied by its path, so the URL does not repeat it.
    const region = next.region === originRegion ? null : next.region

    replace({
      pathname: location.pathname,
      search: filtersToParams({ ...next, region }, base).toString(),
    })
  }

  // The drawer stays open over the search it moves to; the buttons open that search.
  const pickPlace = (place: PlaceSearch) =>
    surface === 'drawer'
      ? replace(placeFiltersPath(filtersToParams({ ...filters, region: null }, params()), place))
      : push(placeSearchPath(params(), place))

  /** Back to everywhere: the place and the region go, and the other answers stay. */
  const clearWhere = () => {
    const rest = { ...filters, region: null }

    if (surface === 'drawer') {
      // Over a page that lists no filtered classes, the drawer moves onto the unscoped search,
      // so the list behind it no longer names that place.
      const origin = parentOf(location.pathname)
      const under = origin && listsFilteredClasses(origin) ? origin : '/search'

      replace({
        pathname: `${under}/filters`,
        search: noPlaceSearch(filtersToParams(rest, params())),
      })

      return
    }
    const onCalendar = location.pathname === '/calendar'

    if (!onCalendar) reset()
    if (!onCalendar && !hasActiveFilters(rest)) push({ pathname: '/', search: '' })
    else write(rest, preserveSearchState(params()))
  }

  return {
    filters,
    write,
    pickPlace,
    clearWhere,
    /**
     * Clear resets the answers, not the Where: the visitor is still looking in the same place.
     * Results the buttons opened from a place's page go back to it, as if never touched.
     */
    clear: () =>
      surface === 'buttons' && clearsBackToPlace(location, filters.region)
        ? push(-1)
        : write({ ...DEFAULT_FILTERS, region: filters.region }),
  }
}
