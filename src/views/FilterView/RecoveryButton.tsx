import type { TranslationKey } from '@/types/i18next'

import { useTranslation } from 'react-i18next'

import { Button } from '@/components/atoms/Button'
import { useLocale } from '@/hooks/use-locale'
import { weekdayNames } from '@/lib/time'
import { type EventFilters, type FilterRecovery } from '@/lib/shape'

export type RecoveryButtonProps = {
  recovery: FilterRecovery
  filters: EventFilters
  onApply: (next: EventFilters) => void
  className?: string
}

/** The way out of "No classes match": it names the answer it removes, and what that brings back. */
export function RecoveryButton({ recovery, filters, onApply, className }: RecoveryButtonProps) {
  const { t } = useTranslation()
  const { formatLocale, languageLabel } = useLocale()
  const labels: Record<FilterRecovery['group'], () => string> = {
    format: () => t(`filters.format.${filters.format}` as TranslationKey),
    days: () => {
      const names = weekdayNames(formatLocale)

      return filters.daysOfWeek.map((day) => names[day - 1]).join(', ')
    },
    time: () => filters.timeOfDay.map((period) => t(`filters.time.${period}`)).join(', '),
    cadence: () => t(`filters.cadence.${filters.cadence.toLowerCase()}` as TranslationKey),
    languages: () => filters.languages.map(languageLabel).join(', '),
    dates: () => t('filters.dates.label'),
  }

  return (
    <Button
      className={className}
      color="primary"
      onClick={() => onApply({ ...filters, ...recovery.patch })}
    >
      <span className="truncate">
        {t('filters.chrome.widen', { label: labels[recovery.group](), count: recovery.count })}
      </span>
    </Button>
  )
}
