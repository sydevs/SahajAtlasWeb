import type { TranslationKey } from '@/types/i18next'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocale } from '@/hooks/use-locale'
import { type EventFilters, type FilterRecovery, isDateRestricted } from '@/lib/shape'
import { weekdayNames } from '@/lib/time'

/** One question of the filters, as the removal names it (`FilterRecovery`). */
export type AnswerGroup = FilterRecovery['group']

/**
 * Each answered question in words, the one way the filter buttons, the filter tags and the
 * removal under an empty list name it ("Tue, Wed", "Evening", "English, French"). An open
 * question is ''.
 */
export function useAnswerLabels(filters: EventFilters): Record<AnswerGroup, string> {
  const { t } = useTranslation()
  const { formatLocale, languageLabel } = useLocale()
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
