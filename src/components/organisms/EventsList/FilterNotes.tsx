import { useTranslation } from 'react-i18next'

import { Button } from '@/components/atoms/Button'
import { RecoveryButton } from '@/components/organisms/SearchFilters'
import { useFilterFacets } from '@/hooks/use-filter-facets'
import { useEventFilters, useSetFilters } from '@/hooks/use-filters'

/**
 * A list the filters emptied: one line saying so, then the ways out as links, stacked — the one
 * removal that brings the most classes back, where a single one does, and Clear filters. Every
 * list of classes renders this one, so the removal is offered in one place: the filters ask only
 * what can narrow the classes here, so an empty set is reached by moving somewhere else after
 * choosing.
 */
export function NoFilterMatches() {
  const { t } = useTranslation()
  const filters = useEventFilters()
  const { clearFilters, setFilters } = useSetFilters()
  const recovery = useFilterFacets(filters)?.recovery

  return (
    <div className="flex flex-col items-start gap-1 px-gutter py-4 text-sm" role="status">
      <p className="text-gray-11">{t('filters.chrome.no_results_classes')}</p>
      {recovery && (
        <RecoveryButton filters={filters} recovery={recovery} variant="link" onApply={setFilters} />
      )}
      <Button color="primary" variant="link" onClick={clearFilters}>
        {t('filters.chrome.clear')}
      </Button>
    </div>
  )
}

/**
 * One line after a filtered list, when the filters hide in-person classes in the area: "4 more
 * classes in this area. Clear filters". `count` is exactly what clearing brings back there.
 */
export function HiddenByFilters({ count }: { count: number }) {
  const { t } = useTranslation()
  const { clearFilters } = useSetFilters()

  return (
    <p className="px-gutter py-4 text-sm text-gray-11">
      {t('filters.chrome.more_area', { count })}{' '}
      <Button color="primary" variant="link" onClick={clearFilters}>
        {t('filters.chrome.clear')}
      </Button>
    </p>
  )
}
