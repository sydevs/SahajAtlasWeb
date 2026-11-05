import { useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'

import { RecoveryButton } from './RecoveryButton'
import { WhereFilter } from './WhereFilter'

import { DrawerBody, DrawerFooter } from '@/components/atoms/Drawer'
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
  filterCloseTarget,
  filterOriginRegion,
  filtersToParams,
  noPlaceSearch,
  parentOf,
  parseBounds,
  parseCenter,
  placeFiltersPath,
  isFilterOverlay,
  resolveStack,
} from '@/lib/shape'
import { useWidgetMode } from '@/config/mode'
import { NavHeader } from '@/views/nav'
import { useDrawerControl } from '@/views/shared'

// The filter drawer, at `/filters`, `/search/filters` over a search, or `<region-path>/filters`
// over a region. There is no draft: every tap writes the URL, the single source of truth the map
// and the counts read, so the map narrows behind the sheet and the footer's number moves with
// the finger. The footer's button is therefore a way to close, not a commit. Closing, by any
// route, lands on the results (see `filterCloseTarget`).
export function FilterView() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { hasMap } = useWidgetMode()
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
  // Nothing matches, and removing any one answer still finds nothing: Clear is the only way out.
  const noWayOut = count === 0 && !facets?.recovery
  // With nothing chosen, closing just goes back, so the button mustn't promise results.
  const goesBack = filterCloseTarget(location.pathname, location.search) === null

  // The calendar doesn't rank by place, so it has no place to ask for first.
  const searchable = parentOf(location.pathname) !== '/calendar'
  const placeFirst = searchable && !filters.region && !center

  return (
    <>
      <NavHeader
        overlay={isFilterOverlay(resolveStack(location.pathname), hasMap)}
        title={t('filters.chrome.title')}
      />
      <DrawerBody className="scroll-pb-[calc(var(--sy-footer-h,0px)_+_var(--sy-sheet-top,0px))] p-4">
        <SearchFilters
          facets={facets}
          placeFirst={placeFirst}
          value={filters}
          where={
            <WhereFilter
              counts={
                facets && {
                  inPerson: facets.counts.format.offline,
                  online: facets.counts.format.online,
                }
              }
              prominent={placeFirst && !canClear}
              region={filters.region}
              searchable={searchable}
              onClear={clearWhere}
              onPlace={pickPlace}
            />
          }
          onChange={write}
        />
      </DrawerBody>
      <DrawerFooter className="border-t border-divider px-4 py-3" sticky={!isWide}>
        {/* A wrapper, because the footer's own safe-area spacer would otherwise take a gap. */}
        <div className="flex flex-wrap items-center gap-2">
          {count === 0 && (
            <p className="w-full text-sm text-foreground">{t('filters.chrome.no_match')}</p>
          )}
          {canClear && (
            <Button
              className={noWayOut ? 'h-11 flex-1' : 'h-11'}
              color={noWayOut ? 'primary' : 'neutral'}
              variant={noWayOut ? 'solid' : 'flat'}
              onClick={() => write({ ...DEFAULT_FILTERS, region: filters.region })}
            >
              {t('filters.chrome.clear_one')}
            </Button>
          )}
          {count === 0 ? (
            facets?.recovery && (
              <RecoveryButton
                className="h-11 min-w-0 flex-1"
                filters={filters}
                recovery={facets.recovery}
                onApply={write}
              />
            )
          ) : (
            <Button
              className="h-11 flex-1"
              color={goesBack ? 'neutral' : 'primary'}
              variant={goesBack ? 'flat' : 'solid'}
              onClick={control.dismiss}
            >
              {goesBack
                ? t('common.chrome.close')
                : count === undefined
                  ? t('filters.chrome.title')
                  : t('filters.chrome.show_classes', { count })}
            </Button>
          )}
        </div>
      </DrawerFooter>
    </>
  )
}
