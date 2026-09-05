import { useMemo } from 'react'
import { DateTime, Info } from 'luxon'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Chip } from '@/components/atoms/Chip'
import { regionsQuery } from '@/config/api'
import { useEventFilters, useSetFilters } from '@/hooks/use-filters'
import { useLocale } from '@/hooks/use-locale'
import { formatTimePeriods } from '@/lib'
import { isDateRestricted, isTimeRestricted } from '@/lib/shape'

/**
 * The active filters, as a row of removable pills at the top of the search
 * results. It shows one pill per filter type. The day-of-week and language
 * selections each collapse into a single pill. Each pill's X clears that
 * filter immediately, as a quick edit on the applied filters. This renders
 * nothing when no filter is active.
 *
 * Every pill here is one of the USER's own filters. The results list's
 * automatic distance cut used to ride along as one more pill, which read as
 * a filter someone had chosen. It is now a segment boundary the list pages
 * across instead, signposted by its own control at the foot of the list
 * (see `revealRows` in `@/lib/shape/reveal`).
 */
export function ActiveFilterPills() {
  const { t } = useTranslation('common')
  const { locale, languageLabel } = useLocale()
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

  const weekdaysShort = useMemo(() => Info.weekdays('short', { locale }), [locale])

  // The cache-once region tree, to resolve the selected slug to its display name below.
  const { data: regions } = useQuery(regionsQuery())

  const pills: { key: string; label: string; onRemove: () => void }[] = []

  if (region) {
    // This shows the region's name, falling back to the slug until the
    // tree loads, or for an unknown slug. It resolves where the app uses
    // it, so there is no null-typed intermediate.
    const name = regions?.find((node) => node.slug === region)?.name ?? region

    pills.push({ key: 'region', label: name, onRemove: () => setRegion(null) })
  }
  if (format !== 'any') {
    pills.push({
      key: 'format',
      label: t(`filters.format.${format}`),
      onRemove: () => setFormat('any'),
    })
  }
  if (cadence !== 'any') {
    pills.push({
      key: 'cadence',
      label: t(`filters.cadence.${cadence.toLowerCase()}`),
      onRemove: () => setCadence('any'),
    })
  }
  if (daysOfWeek.length > 0) {
    pills.push({
      key: 'days',
      label: daysOfWeek.map((day) => weekdaysShort[day - 1]).join(', '),
      onRemove: () => setDaysOfWeek([]),
    })
  }
  if (isTimeRestricted(timeOfDay)) {
    pills.push({
      key: 'time',
      // This is empty when every period is selected, a whole-day cover. It then reads as "any time".
      label: formatTimePeriods(locale, timeOfDay) || t('filters.any_time'),
      onRemove: () => setTimeOfDay([]),
    })
  }
  if (languages.length > 0) {
    pills.push({
      key: 'languages',
      label: languages.map(languageLabel).join(', '),
      onRemove: () => setLanguages([]),
    })
  }
  if (isDateRestricted(dateRange)) {
    const fmt = (iso: string) =>
      DateTime.fromISO(iso).setLocale(locale).toLocaleString(DateTime.DATE_MED)
    const { start, end } = dateRange
    let label = ''

    if (start && end) label = t('filters.dates.pill_range', { start: fmt(start), end: fmt(end) })
    else if (start) label = t('filters.dates.pill_from', { date: fmt(start) })
    else if (end) label = t('filters.dates.pill_until', { date: fmt(end) })

    pills.push({ key: 'dates', label, onRemove: () => setDateRange({ start: null, end: null }) })
  }

  if (pills.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5 px-4 pb-2 pt-1">
      {pills.map((pill) => (
        <Chip
          key={pill.key}
          closeLabel={t('filters.remove', { label: pill.label })}
          color="neutral"
          radius="full"
          onClose={pill.onRemove}
        >
          {pill.label}
        </Chip>
      ))}
    </div>
  )
}
