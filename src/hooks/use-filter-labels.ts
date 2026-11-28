import type { TranslationKey } from '@/types/i18next'

import { useMemo } from 'react'

import { useLocale } from '@/hooks/use-locale'
import { type EventFilters, type FilterRecovery, isDateRestricted } from '@/lib/shape'
import { weekdayNames } from '@/lib/time'

/**
 * Each answered question in words, as the filter buttons and the removal under an empty list
 * name it ("Tue, Wed", "Evening", "English, French"). An open question is ''. The filter tags
 * take it too, except for times and dates, which they spell out in full (hours, the range).
 */
export function useFilterLabels(filters: EventFilters): Record<FilterRecovery['group'], string> {
  const { t, formatLocale, languageLabel } = useLocale()
  const weekdays = useMemo(() => weekdayNames(formatLocale, 'short'), [formatLocale])

  return {
    format: filters.format === 'any' ? '' : t(`filters.format.${filters.format}`),
    days: filters.daysOfWeek.map((day) => weekdays[day - 1]).join(', '),
    time: filters.timeOfDay.map((period) => t(`filters.time.${period}`)).join(', '),
    cadence:
      filters.cadence === 'any'
        ? ''
        : t(`filters.cadence.${filters.cadence.toLowerCase()}` as TranslationKey),
    languages: filters.languages.map(languageLabel).join(', '),
    dates: isDateRestricted(filters.dateRange) ? t('filters.dates.label') : '',
  }
}
