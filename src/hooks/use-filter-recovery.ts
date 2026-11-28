import { useTranslation } from 'react-i18next'

import { useFilterLabels } from '@/hooks/use-filter-labels'
import { type EventFilters, type FilterRecovery } from '@/lib/shape'

/**
 * The way out of "No classes match": the one answer whose removal brings the most classes back,
 * named with what it brings back ("Remove Monday (3 classes)"), and the step that removes it.
 * Whoever draws it decides how it looks: a button at the foot of the filters, a link under a list.
 * `undefined` where no single removal brings any back (`bestRecovery`).
 */
export function useFilterRecovery(
  filters: EventFilters,
  recovery: FilterRecovery | null | undefined,
  apply: (next: EventFilters) => void,
): { label: string; apply: () => void } | undefined {
  const { t } = useTranslation()
  // In a sentence, so the days in full: "Remove Monday".
  const labels = useFilterLabels(filters, 'long')

  if (!recovery) return undefined

  return {
    label: t('filters.chrome.widen', { label: labels[recovery.group], count: recovery.count }),
    apply: () => apply({ ...filters, ...recovery.patch }),
  }
}
