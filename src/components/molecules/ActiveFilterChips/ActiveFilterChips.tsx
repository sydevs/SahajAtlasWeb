import type { TranslationKey } from '@/types/i18next'

import { useMemo } from 'react'
import { DateTime } from 'luxon'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Chip } from '@/components/atoms/Chip'
import { regionsQuery } from '@/config/api'
import { useEventFilters, useSetFilters } from '@/hooks/use-filters'
import { useFilterRow } from '@/hooks/use-filter-row'
import { useLocale } from '@/hooks/use-locale'
import { formatTimePeriods } from '@/lib'
import { formatDate, weekdayNames } from '@/lib/time'
import { isDateRestricted, isTimeRestricted } from '@/lib/shape'

/**
 * The active filters, as a row of removable chips at the top of the search
 * results. It shows one chip per filter type. The day-of-week and language
 * selections each collapse into a single chip. Each chip's X clears that
 * filter immediately, as a quick edit on the applied filters. This renders
 * nothing when no filter is active.
 *
 * Every chip here is one of the USER's own filters. The results list's
 * automatic distance cut used to ride along as one more chip, which read as
 * a filter someone had chosen. It is now a segment boundary the list pages
 * across instead, signposted by its own control at the foot of the list
 * (see `revealRows` in `@/lib/shape/reveal`).
 *
 * Beside the filter buttons, which already name every answer, it shows nothing.
 */
export function ActiveFilterChips() {
  const row = useFilterRow()
  const { t } = useTranslation()
  const { formatLocale, languageLabel } = useLocale()
  const { format, timeOfDay, daysOfWeek, languages, cadence, dateRange, region } = useEventFilters()
  const {
    setFormat,
    setCadence,
    setTimeOfDay,
    setDaysOfWeek,
    setLanguages,
    setDateRange,
    setRegion,
  } = useSetFilters()

  const weekdaysShort = useMemo(() => weekdayNames(formatLocale, 'short'), [formatLocale])

  // The cache-once region tree, to resolve the selected slug to its display name below.
  const { data: regions } = useQuery(regionsQuery())

  const chips: { key: string; label: string; onRemove: () => void }[] = []

  if (region) {
    // This shows the region's name, falling back to the slug until the
    // tree loads, or for an unknown slug. It resolves where the app uses
    // it, so there is no null-typed intermediate.
    const name = regions?.find((node) => node.slug === region)?.name ?? region

    chips.push({ key: 'region', label: name, onRemove: () => setRegion(null) })
  }
  if (format !== 'any') {
    chips.push({
      key: 'format',
      label: t(`filters.format.${format}`),
      onRemove: () => setFormat('any'),
    })
  }
  if (cadence !== 'any') {
    chips.push({
      key: 'cadence',
      label: t(`filters.cadence.${cadence.toLowerCase()}` as TranslationKey),
      onRemove: () => setCadence('any'),
    })
  }
  if (daysOfWeek.length > 0) {
    chips.push({
      key: 'days',
      label: daysOfWeek.map((day) => weekdaysShort[day - 1]).join(', '),
      onRemove: () => setDaysOfWeek([]),
    })
  }
  if (isTimeRestricted(timeOfDay)) {
    chips.push({
      key: 'time',
      // This is empty when every period is selected, a whole-day cover. It then reads as "any time".
      label: formatTimePeriods(formatLocale, timeOfDay) || t('filters.chrome.any_time'),
      onRemove: () => setTimeOfDay([]),
    })
  }
  if (languages.length > 0) {
    chips.push({
      key: 'languages',
      label: languages.map(languageLabel).join(', '),
      onRemove: () => setLanguages([]),
    })
  }
  if (isDateRestricted(dateRange)) {
    const fmt = (iso: string) => formatDate(DateTime.fromISO(iso), formatLocale, { weekday: false })
    const { start, end } = dateRange
    let label = ''

    if (start && end) label = t('filters.dates.pill_range', { start: fmt(start), end: fmt(end) })
    else if (start) label = t('filters.dates.pill_from', { date: fmt(start) })
    else if (end) label = t('filters.dates.pill_until', { date: fmt(end) })

    chips.push({ key: 'dates', label, onRemove: () => setDateRange({ start: null, end: null }) })
  }

  if (row || chips.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5 px-gutter pt-1 pb-2">
      {chips.map((chip) => (
        <Chip
          key={chip.key}
          closeLabel={t('filters.a11y.remove', { label: chip.label })}
          color="neutral"
          radius="full"
          onClose={chip.onRemove}
        >
          {chip.label}
        </Chip>
      ))}
    </div>
  )
}
