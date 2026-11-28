import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'

import { WhereFilter } from './WhereFilter'

import { FilterMenus, type FilterMenusProps } from '@/components/organisms/FilterMenus'
import { regionsQuery } from '@/config/api'
import { useSearchFocus } from '@/config/store'
import { useFilterEditor } from '@/hooks/use-filter-editor'
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
 * The filter buttons wired to the URL (`useFilterEditor`), with the Where menu's place half, which
 * needs the router and the geocoder.
 */
export function FilterMenuBar({ variant }: Pick<FilterMenusProps, 'variant'>) {
  const { t } = useLocale()
  const { filters, write, clear, where } = useFilterEditor('buttons')
  const [searchParams] = useSearchParams()
  const center = parseCenter(searchParams.get('center'))
  const nearMe = useNearVisitor(center)
  const { data: regions } = useQuery(regionsQuery())

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
        always: where.searchable,
        menu: (facets) => (
          <WhereFilter {...where} counts={facets?.counts.format} onSearchInstead={focusSearch} />
        ),
      }}
      onChange={write}
      onClear={clear}
    />
  )
}
