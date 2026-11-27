import { useMemo } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { WhereFilter } from './WhereFilter'

import { DrawerBody, DrawerFooter } from '@/components/atoms/Drawer'
import { Button } from '@/components/atoms/Button'
import { RecoveryButton, SearchFilters } from '@/components/organisms'
import { regionQuery } from '@/config/api'
import { useIsWideWidget } from '@/config/responsive'
import { useSearchFocus } from '@/config/store'
import { useEventFilters } from '@/hooks/use-filters'
import { useFilterFacets } from '@/hooks/use-filter-facets'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import {
  DEFAULT_FILTERS,
  type EventFilters,
  type PlaceSearch,
  filterOriginRegion,
  filtersToParams,
  hasActiveFilters,
  listsFilteredClasses,
  noPlaceSearch,
  parentOf,
  parseBounds,
  parseCenter,
  placeFiltersPath,
} from '@/lib/shape'
import { NavHeader } from '@/views/nav'
import { useDrawerControl, useFrameOnTop } from '@/views/shared'

// The event-filters drawer, at route `/filters`, `/search/filters` when stacked over a search, or
// `<region-path>/filters` over a region. There is no draft: every tap writes the URL, the single
// source of truth the list, the map and the counts all read, so the markers behind the sheet and
// the footer's number move with each tap. Closing, by the footer's button, the X, a swipe or Esc,
// shows the matching classes (`backStep`).
export function FilterView() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { locale } = useLocale()
  const control = useDrawerControl()
  const applied = useEventFilters()
  const originRegion = filterOriginRegion(location.pathname)

  // Opened over a region, the filters are scoped to it without saying so in the URL, so an
  // untouched `/gb/filters` still reads as nothing chosen and closes back onto `/gb`.
  const filters = useMemo(
    () => ({ ...applied, region: applied.region ?? originRegion }),
    [applied, originRegion],
  )
  const facets = useFilterFacets(filters)
  const count = facets?.counts.total

  // The view beneath. Only the calendar and the search list show filtered classes, so over any
  // other view a place search moves the filters onto a search.
  const origin = parentOf(location.pathname)
  const filtersOrigin = origin && listsFilteredClasses(origin) ? origin : '/search'

  const moveTo = (to: { pathname: string; search: string } | string) =>
    navigate(to, { replace: true, state: location.state })

  const write = (next: EventFilters) => {
    const region = next.region === originRegion ? null : next.region

    moveTo({
      pathname: location.pathname,
      search: filtersToParams({ ...next, region }, new URLSearchParams(location.search)).toString(),
    })
  }

  // A place replaces any region, and the drawer moves over that search.
  const pickPlace = (place: PlaceSearch) =>
    moveTo(
      placeFiltersPath(
        filtersToParams({ ...filters, region: null }, new URLSearchParams(location.search)),
        place,
      ),
    )

  // Drops the place and the region, and keeps every other answer. Over a region's own page the
  // drawer moves onto the unscoped search, so the list behind it no longer names that region.
  const clearWhere = () =>
    moveTo({
      pathname: `${filtersOrigin}/filters`,
      search: noPlaceSearch(
        filtersToParams({ ...filters, region: null }, new URLSearchParams(location.search)),
      ),
    })

  // A fresh link to the filters has no view beneath that framed the map, so the filters frame
  // their own place, once.
  const { frameRegion, frameSearch, hasMap } = useMapController()
  const { data: place } = useQuery({
    ...regionQuery(originRegion ?? '', locale),
    enabled: originRegion !== null && !control.overlay,
  })
  const center = searchParams.get('center')
  const bbox = searchParams.get('bbox')

  useFrameOnTop(
    ({ isEntry }) => {
      if (!isEntry || control.overlay) return
      if (place) frameRegion(place)
      else if (center) frameSearch({ bbox: parseBounds(bbox), center: parseCenter(center) })
    },

    [place],
  )

  // Only the top view is rendered, so the list's search box takes the focus once it mounts.
  const requestSearchFocus = useSearchFocus((s) => s.request)
  const searchInstead = () => {
    requestSearchFocus()
    control.dismiss()
  }

  // Clear resets the answers, not the Where: the visitor is still looking in the same place.
  const answered = hasActiveFilters({ ...filters, region: null })
  const clear = () => write({ ...DEFAULT_FILTERS, region: filters.region })
  const recovery = count === 0 ? facets?.recovery : undefined
  // Nothing matches, and removing any one answer still finds nothing: Clear is the way out.
  const clearLeads = count === 0 && !recovery
  // On the phone sheet the bar is pinned to the screen's bottom edge, so the way out stays in
  // reach whatever the sheet's height. The calendar's overlay fills the screen, so its own end is
  // already there.
  const isWide = useIsWideWidget()
  const sticky = hasMap && !isWide && !control.overlay

  return (
    <>
      {/* The filters sit over the page they narrow, so they close back onto it with an X. */}
      <NavHeader close title={t('filters.chrome.title')} />
      <DrawerBody
        fitSheet
        className={`px-gutter py-4 ${sticky ? 'scroll-pb-[calc(var(--sy-footer-h,0px)_+_var(--sy-sheet-top,0px))]' : ''}`}
      >
        <SearchFilters
          facets={facets}
          value={filters}
          where={
            <WhereFilter
              counts={facets?.counts.format}
              region={filters.region}
              searchable={origin !== '/calendar'}
              onClear={clearWhere}
              onPlace={pickPlace}
              onSearchInstead={searchInstead}
            />
          }
          onChange={write}
        />
      </DrawerBody>
      <DrawerFooter className="border-t border-divider px-gutter py-3" sticky={sticky}>
        {/* A wrapper, so the pinned bar's safe-area spacer takes no gap of its own. */}
        <div className="flex flex-wrap items-center gap-2">
          {count === 0 && (
            <p className="w-full text-sm text-foreground" role="status">
              {t('filters.chrome.no_match')}
            </p>
          )}
          {answered && (
            <Button
              className={clearLeads ? 'flex-1' : undefined}
              color={clearLeads ? 'primary' : 'neutral'}
              variant={clearLeads ? 'solid' : 'flat'}
              onClick={clear}
            >
              {t('filters.chrome.clear')}
            </Button>
          )}
          {recovery ? (
            <RecoveryButton
              className="min-w-0 flex-1"
              filters={filters}
              recovery={recovery}
              onApply={write}
            />
          ) : (
            !clearLeads && (
              <Button
                className="flex-1"
                color={answered ? 'primary' : 'neutral'}
                variant={answered ? 'solid' : 'flat'}
                onClick={answered ? control.showResults : control.dismiss}
              >
                {answered && count !== undefined
                  ? t('filters.chrome.show_classes', { count })
                  : t('common.chrome.close')}
              </Button>
            )
          )}
        </div>
      </DrawerFooter>
    </>
  )
}
