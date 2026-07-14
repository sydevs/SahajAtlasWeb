import { useMemo } from 'react'
import { DateTime, Info } from 'luxon'
import { useTranslation } from 'react-i18next'

import { Chip } from '@/components/atoms/Chip'
import { useEventFilters, useSetFilters } from '@/hooks/use-filters'
import { useLocale } from '@/hooks/use-locale'
import { formatHour } from '@/lib'
import { TIME_MAX, TIME_MIN, isDateRestricted, isTimeRestricted } from '@/lib/shape'

export type ActiveFilterPillsProps = {
  /**
   * The search-only "within N km" cap pill. Not part of the stored filters (it
   * depends on the searched location), so the list owns it and passes it in.
   */
  nearby?: { km: number; onClear: () => void }
}

/**
 * The active filters, as a row of removable pills at the top of the search
 * results. One pill per filter type — the day-of-week and language selections are
 * each collapsed into a single pill — plus the optional distance cap. Each pill's
 * X clears that filter immediately (a quick-edit on the applied store state).
 * Renders nothing when no filter is active.
 */
export function ActiveFilterPills({ nearby }: ActiveFilterPillsProps) {
  const { t } = useTranslation('common')
  const { locale, languageLabel } = useLocale()
  const { format, timeOfDay, daysOfWeek, languages, cadence, dateRange } = useEventFilters()
  const { setFormat, setCadence, setTimeOfDay, setDaysOfWeek, setLanguages, setDateRange } =
    useSetFilters()

  const weekdaysShort = useMemo(() => Info.weekdays('short', { locale }), [locale])

  const pills: { key: string; label: string; onRemove: () => void }[] = []

  if (nearby) {
    pills.push({
      key: 'nearby',
      label: t('filters.nearby', { km: nearby.km }),
      onRemove: nearby.onClear,
    })
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
      label: `${formatHour(locale, timeOfDay[0])} – ${formatHour(locale, timeOfDay[1])}`,
      onRemove: () => setTimeOfDay([TIME_MIN, TIME_MAX]),
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
          color="default"
          radius="full"
          onClose={pill.onRemove}
        >
          {pill.label}
        </Chip>
      ))}
    </div>
  )
}
