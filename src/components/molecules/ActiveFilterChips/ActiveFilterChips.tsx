import { DateTime } from 'luxon'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Chip } from '@/components/atoms/Chip'
import { regionsQuery } from '@/config/api'
import { useEventFilters, useSetFilters } from '@/hooks/use-filters'
import { useAnswerLabels } from '@/hooks/use-answer-labels'
import { useFilterMenusOnMap } from '@/hooks/use-filter-menus'
import { useLocale } from '@/hooks/use-locale'
import { formatTimePeriods } from '@/lib'
import { formatDate } from '@/lib/time'
import { type EventFilters, isDateRestricted, isTimeRestricted } from '@/lib/shape'

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
export function ActiveFilterChips({ filters }: { filters?: EventFilters } = {}) {
  const menusShown = useFilterMenusOnMap()
  const { t } = useTranslation()
  const { formatLocale } = useLocale()
  const applied = useEventFilters()
  // A view may show fewer than the URL holds: the calendar's place is its title, not a pill.
  const shown = filters ?? applied
  const { timeOfDay, dateRange, region } = shown
  const {
    setFormat,
    setCadence,
    setTimeOfDay,
    setDaysOfWeek,
    setLanguages,
    setDateRange,
    setRegion,
  } = useSetFilters()

  const labels = useAnswerLabels(shown)

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
  if (labels.format) {
    chips.push({
      key: 'format',
      label: labels.format,
      onRemove: () => setFormat('any'),
    })
  }
  if (labels.cadence) {
    chips.push({
      key: 'cadence',
      label: labels.cadence,
      onRemove: () => setCadence('any'),
    })
  }
  if (labels.days) {
    chips.push({
      key: 'days',
      label: labels.days,
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
  if (labels.languages) {
    chips.push({
      key: 'languages',
      label: labels.languages,
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

  if (menusShown || chips.length === 0) return null

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
