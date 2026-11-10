import type { TranslationKey } from '@/types/i18next'

import { useMemo } from 'react'
import { DateTime, Info } from 'luxon'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Chip } from '@/components/atoms/Chip'
import { regionsQuery } from '@/config/api'
import { useEventFilters, useSetFilters } from '@/hooks/use-filters'
import { useLocale } from '@/hooks/use-locale'
import { formatTimePeriods } from '@/lib'
import { type EventFilters, type FilterKey, isDateRestricted, isTimeRestricted } from '@/lib/shape'
import { formatDate, regionalLocale } from '@/lib/time'

export type FilterPill = { key: FilterKey; label: string; onRemove: () => void }

/**
 * One entry per active filter, in display order: what it reads as, and how to remove it.
 * A view that says some of these another way passes the rest as `filters`.
 */
export function useFilterPills(filters?: EventFilters): FilterPill[] {
  const { t } = useTranslation()
  const { locale, languageLabel } = useLocale()
  const applied = useEventFilters()
  // A view that says some of these another way passes the rest. See `chosenCalendarFilters`.
  const { format, timeOfDay, daysOfWeek, languages, cadence, dateRange, region } =
    filters ?? applied
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

  const pills: FilterPill[] = []

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
      label: t(`filters.cadence.${cadence.toLowerCase()}` as TranslationKey),
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
      label: formatTimePeriods(locale, timeOfDay) || t('filters.chrome.any_time'),
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
    // "11 Nov", like the calendar's day headings; the year only when it is not this one.
    const fmt = (iso: string) =>
      formatDate(DateTime.fromISO(iso), regionalLocale(locale), { weekday: false })
    const { start, end } = dateRange
    let label = ''

    if (start && end) label = t('filters.dates.pill_range', { start: fmt(start), end: fmt(end) })
    else if (start) label = t('filters.dates.pill_from', { date: fmt(start) })
    else if (end) label = t('filters.dates.pill_until', { date: fmt(end) })

    pills.push({ key: 'dates', label, onRemove: () => setDateRange({ start: null, end: null }) })
  }

  return pills
}

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
 *
 * `inline` renders the pills alone, without their own row, for a parent that lays them out:
 * the list toolbar puts them beside its Filters button (`ListToolbar`'s `tags`).
 */
export function ActiveFilterPills({
  filters,
  inline = false,
}: {
  filters?: EventFilters
  inline?: boolean
}) {
  const { t } = useTranslation()
  const pills = useFilterPills(filters)

  if (pills.length === 0) return null

  const chips = pills.map((pill) => (
    <Chip
      key={pill.key}
      closeLabel={t('filters.chrome.remove', { label: pill.label })}
      color="neutral"
      radius="full"
      onClose={pill.onRemove}
    >
      {pill.label}
    </Chip>
  ))

  if (inline) return <>{chips}</>

  return <div className="flex flex-wrap gap-1.5 px-gutter pt-1 pb-2">{chips}</div>
}
