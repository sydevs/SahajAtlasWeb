import { useTranslation } from 'react-i18next'

import { Button } from '@/components/atoms/Button'
import { useFilterCounts } from '@/hooks/use-filter-counts'
import { useEventFilters, useSetFilters } from '@/hooks/use-filters'
import { useFilterRecovery } from '@/hooks/use-filter-recovery'
import { DEFAULT_FILTERS, type EventFilters } from '@/lib/shape'

export type FilterNoticeProps = {
  /** The answers the list shows; the URL's by default. */
  filters?: EventFilters
} & (
  | {
      /** The filters emptied the list. */
      kind: 'no-match'
    }
  | {
      /** The filters hide in-person classes in the area: `count`, exactly what clearing brings back. */
      kind: 'hidden'
      count: number
    }
)

/**
 * What a list of classes says about its filters, the same on every list:
 *
 * - `no-match`: one line saying nothing matches, then the ways out as links, stacked: the one
 *   removal that brings the most classes back, where a single one does, and Clear filters. The
 *   removal is offered here and nowhere else: the filters ask only what can narrow the classes
 *   here, so an empty set is reached by moving somewhere else after choosing.
 * - `hidden`: one line after the list, "4 more classes in this area. Clear filters".
 *
 * Clear resets the answers, not the Where: the visitor is still looking in the same place.
 */
export function FilterNotice(props: FilterNoticeProps) {
  const applied = useEventFilters()
  const filters = props.filters ?? applied

  return props.kind === 'no-match' ? (
    <NoMatch filters={filters} />
  ) : (
    <Hidden count={props.count} filters={filters} />
  )
}

/** Clear filters, as a link. */
function ClearLink({ filters }: { filters: EventFilters }) {
  const { t } = useTranslation()
  const { setFilters } = useSetFilters()

  return (
    <Button
      color="primary"
      variant="link"
      onClick={() => setFilters({ ...DEFAULT_FILTERS, region: filters.region })}
    >
      {t('filters.chrome.clear')}
    </Button>
  )
}

// Counts only here: a list with classes has no removal to offer.
function NoMatch({ filters }: { filters: EventFilters }) {
  const { t } = useTranslation()
  const { setFilters } = useSetFilters()
  const removal = useFilterRecovery(filters, useFilterCounts(filters)?.recovery, setFilters)

  return (
    <div className="flex flex-col items-start gap-1 px-gutter py-4 text-sm" role="status">
      <p className="text-gray-11">{t('filters.chrome.no_results_classes')}</p>
      {removal && (
        <Button color="primary" variant="link" onClick={removal.apply}>
          {removal.label}
        </Button>
      )}
      <ClearLink filters={filters} />
    </div>
  )
}

function Hidden({ count, filters }: { count: number; filters: EventFilters }) {
  const { t } = useTranslation()

  return (
    <p className="px-gutter py-4 text-sm text-gray-11">
      {t('filters.chrome.more_area', { count })} <ClearLink filters={filters} />
    </p>
  )
}
