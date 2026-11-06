import type { TranslationKey } from '@/types/i18next'
import type { EventFilters, FilterRecovery } from '@/lib/shape'

import { Info } from 'luxon'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/atoms/Button'
import { useLocale } from '@/hooks/use-locale'

export type RecoveryButtonProps = {
  recovery: FilterRecovery
  filters: EventFilters
  onApply: (next: EventFilters) => void
  className?: string
}

/** The way out of "no classes match": names the one answer to remove, and what that brings back. */
export function RecoveryButton({ recovery, filters, onApply, className }: RecoveryButtonProps) {
  const { t } = useTranslation()
  const { locale, languageLabel } = useLocale()
  const weekdays = Info.weekdays('long', { locale })
  const labels: Record<FilterRecovery['group'], () => string> = {
    format: () => t(`filters.format.${filters.format}` as TranslationKey),
    days: () => filters.daysOfWeek.map((day) => weekdays[day - 1]).join(', '),
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
      {t('filters.chrome.widen', { label: labels[recovery.group](), count: recovery.count })}
    </Button>
  )
}
