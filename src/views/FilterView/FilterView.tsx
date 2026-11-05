import { useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'

import { WhereFilter } from './WhereFilter'

import { DrawerBody, DrawerFooter, DrawerHeader } from '@/components/atoms/Drawer'
import { Button } from '@/components/atoms/Button'
import { SearchFilters } from '@/components/molecules'
import { useIsWideWidget } from '@/config/responsive'
import { useEventFilters } from '@/hooks/use-filters'
import { useFilterFacets } from '@/hooks/use-filter-facets'
import { useMapController } from '@/hooks/use-map-controller'
import {
  DEFAULT_FILTERS,
  type EventFilters,
  type PlaceSearch,
  activeFilterCount,
  filterOriginRegion,
  filtersToParams,
  noPlaceSearch,
  parentOf,
  parseBounds,
  parseCenter,
  placeFiltersPath,
} from '@/lib/shape'
import { CloseButton, DrawerTitle, useDrawerControl } from '@/views/shared'

// The filter drawer, at `/filters`, `/search/filters` over a search, or `<region-path>/filters`
// over a region. There is no draft: every tap writes the URL, the single source of truth the map
// and the counts read, so the map narrows behind the sheet and the footer's number moves with
// the finger. The footer's button is therefore a way to close, not a commit. Closing, by any
// route, lands on the results (see `filterCloseTarget`).
export function FilterView() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const applied = useEventFilters()
  const control = useDrawerControl()
  const isWide = useIsWideWidget()
  const { frameSearch, reset } = useMapController()
  const originRegion = filterOriginRegion(location.pathname)

  // A region's drawer is scoped to that region without saying so in the URL. So an untouched
  // `/gb/filters` can still tell "nothing chosen" apart, and go back to `/gb` on close.
  const filters = useMemo(
    () => ({ ...applied, region: applied.region ?? originRegion }),
    [applied, originRegion],
  )
  const facets = useFilterFacets(filters)
  const count = facets?.counts.total

  // The camera follows Where. Every other filter leaves it alone, so the visitor sees pins
  // drop away rather than the map jumping about.
  const center = searchParams.get('center')
  const bbox = searchParams.get('bbox')
  const framed = useRef(`${center}|${bbox}|${filters.region}`)

  useEffect(() => {
    const key = `${center}|${bbox}|${filters.region}`

    if (key === framed.current) return
    framed.current = key

    if (center) frameSearch({ bbox: parseBounds(bbox), center: parseCenter(center) })
    else if (!filters.region) reset()
    // `frameSearch` and `reset` change identity with the camera provider, not with the place.
  }, [center, bbox, filters.region])

  const write = (next: EventFilters, base = new URLSearchParams(location.search)) => {
    const inOrigin = next.region !== null && next.region === originRegion
    const leftOrigin = originRegion !== null && next.region === null
    const search = filtersToParams({ ...next, region: inOrigin ? null : next.region }, base)

    navigate(
      { pathname: leftOrigin ? '/filters' : location.pathname, search: search.toString() },
      { replace: true, state: location.state },
    )
  }

  const pickPlace = (place: PlaceSearch) =>
    navigate(
      placeFiltersPath(
        filtersToParams({ ...filters, region: null }, new URLSearchParams(location.search)),
        place,
      ),
      { replace: true, state: location.state },
    )

  // Back to everywhere: the place and the region both go, and the other filters stay.
  const clearWhere = () =>
    write(
      { ...filters, region: null },
      new URLSearchParams(noPlaceSearch(new URLSearchParams(location.search))),
    )

  // Clear resets the questions, not the Where: the visitor is still looking in the same place.
  const canClear = activeFilterCount({ ...filters, region: null }) > 0

  return (
    <>
      <DrawerHeader className="justify-between">
        <DrawerTitle title={t('filters.chrome.title')} />
        <CloseButton />
      </DrawerHeader>
      <DrawerBody className="scroll-pb-[calc(var(--sy-footer-h,0px)_+_var(--sy-sheet-top,0px))] p-4">
        <SearchFilters
          facets={facets}
          value={filters}
          where={
            <WhereFilter
              region={filters.region}
              searchable={parentOf(location.pathname) !== '/calendar'}
              onClear={clearWhere}
              onPlace={pickPlace}
            />
          }
          onChange={write}
        />
      </DrawerBody>
      <DrawerFooter
        className="flex items-center gap-2 border-t border-divider p-3"
        sticky={!isWide}
      >
        {canClear && (
          <Button
            className="h-11"
            variant="flat"
            onClick={() => write({ ...DEFAULT_FILTERS, region: filters.region })}
          >
            {t('filters.chrome.clear_one')}
          </Button>
        )}
        <Button
          className="h-11 flex-1"
          color="primary"
          disabled={count === 0}
          onClick={control.dismiss}
        >
          {count === undefined
            ? t('filters.chrome.title')
            : count === 0
              ? t('filters.chrome.no_match')
              : t('filters.chrome.show_classes', { count })}
        </Button>
      </DrawerFooter>
    </>
  )
}
