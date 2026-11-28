import type { TranslationKey } from '@/types/i18next'

import { useLocale } from '@/hooks/use-locale'
import { type EventFilters, type FilterRecovery, isDateRestricted } from '@/lib/shape'
import { weekdayNames } from '@/lib/time'

/**
 * Each answered question in words, as the filter buttons and tags name it ("Tue, Wed",
 * "Evening", "English, French"). An open question is ''. The tags take it except for times and
 * dates, which they spell out in full (hours, the range).
 *
 * `width` is the day names': short where space is tight, `long` where the answer sits in a
 * sentence, as the removal under an empty list does ("Remove Monday", `useFilterRecovery`).
 *
 * The full form's own fields (`SearchFilters/filter-blocks.tsx`) stay out, though
 * `LanguageChoices` names languages identically today: a field shows its value, where these
 * abbreviate to fit.
 */
export function useFilterLabels(
  filters: EventFilters,
  width: 'long' | 'short' = 'short',
): Record<FilterRecovery['group'], string> {
  const { t, formatLocale, languageLabel } = useLocale()
  const weekdays = weekdayNames(formatLocale, width)

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
