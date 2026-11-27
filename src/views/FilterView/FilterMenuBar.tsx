import { useQuery } from '@tanstack/react-query'
import { useLocation, useSearchParams } from 'react-router'

import { usePanelFilters } from './use-panel-filters'
import { WhereFilter } from './WhereFilter'

import { FilterMenus, type FilterMenusProps } from '@/components/organisms/FilterMenus'
import { regionsQuery } from '@/config/api'
import { useSearchFocus } from '@/config/store'
import { useLocale } from '@/hooks/use-locale'
import { useNearVisitor } from '@/hooks/use-near-me'
import { parseCenter, searchedPlaceName } from '@/lib/shape'

// Focuses the list's search box beside the buttons, and leaves no request behind where none is
// on screen to take it.
const focusSearch = () => {
  const { request, consume } = useSearchFocus.getState()

  request()
  consume()
}

/**
 * The filter buttons wired to the URL (`usePanelFilters`), with the Where menu's place half, which
 * needs the router and the geocoder.
 */
export function FilterMenuBar({ variant }: Pick<FilterMenusProps, 'variant'>) {
  const { t } = useLocale()
  const { filters, write, clear, pickPlace, clearWhere } = usePanelFilters()
  const [searchParams] = useSearchParams()
  const center = parseCenter(searchParams.get('center'))
  const nearMe = useNearVisitor(center)
  const { data: regions } = useQuery(regionsQuery())
  // The calendar does not rank by place, so it has no Near me, and its Where is only a scope.
  const searchable = useLocation().pathname !== '/calendar'

  return (
    <FilterMenus
      value={filters}
      variant={variant}
      where={{
        place: center
          ? nearMe
            ? t('filters.where.near_me')
            : searchedPlaceName(searchParams.get('q'))
          : regions?.find((node) => node.slug === filters.region)?.name,
        placeAnswered: Boolean(center),
        always: searchable,
        menu: (facets) => (
          <WhereFilter
            counts={facets?.counts.format}
            region={filters.region}
            searchable={searchable}
            onClear={clearWhere}
            onPlace={pickPlace}
            onSearchInstead={focusSearch}
          />
        ),
      }}
      onChange={write}
      onClear={clear}
    />
  )
}
