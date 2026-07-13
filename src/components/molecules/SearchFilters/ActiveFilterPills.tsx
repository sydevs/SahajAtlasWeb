import { useMemo } from 'react'
import { Info } from 'luxon'
import { useTranslation } from 'react-i18next'

import { formatHour } from './SearchFilters'

import { CloseIcon } from '@/components/atoms/Icons'
import { useSearchState } from '@/config/store'
import { useLocale } from '@/hooks/use-locale'
import { type EventCadence, TIME_MAX, TIME_MIN, isTimeRestricted } from '@/lib/shape'

// Frequency value → its lowercased i18n leaf key (`recurrenceType` is upper-case).
const CADENCE_KEY: Record<Exclude<EventCadence, 'any'>, string> = {
  once: 'once',
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
}

// A single removable filter pill: its label plus an X that removes that filter.
function FilterPill({
  label,
  removeLabel,
  onRemove,
}: {
  label: string
  removeLabel: string
  onRemove: () => void
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary-3 py-1 pl-2.5 pr-1 text-xs font-medium text-primary-11">
      <span className="truncate">{label}</span>
      <button
        aria-label={removeLabel}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-primary-5"
        type="button"
        onClick={onRemove}
      >
        <CloseIcon size={12} />
      </button>
    </span>
  )
}

/**
 * The active (applied) filters, as a row of removable pills shown above the search
 * results. Each pill's X removes that filter immediately (a quick-edit on the
 * applied store state — distinct from the FilterView drawer's deferred Apply).
 * Renders nothing when no filter is active.
 */
export function ActiveFilterPills() {
  const { t } = useTranslation('common')
  const { locale, languageNames } = useLocale()
  const {
    format,
    timeOfDay,
    daysOfWeek,
    languages,
    cadence,
    setFormat,
    setCadence,
    setTimeOfDay,
    setDaysOfWeek,
    toggleLanguage,
  } = useSearchState()

  const weekdaysShort = useMemo(() => Info.weekdays('short', { locale }), [locale])

  const languageLabel = (code: string) => {
    try {
      return languageNames.of(code) ?? code
    } catch {
      return code
    }
  }

  const pills: { key: string; label: string; onRemove: () => void }[] = []

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
      label: t(`filters.cadence.${CADENCE_KEY[cadence]}`),
      onRemove: () => setCadence('any'),
    })
  }
  daysOfWeek.forEach((day) => {
    pills.push({
      key: `day-${day}`,
      label: weekdaysShort[day - 1],
      onRemove: () => setDaysOfWeek(daysOfWeek.filter((value) => value !== day)),
    })
  })
  if (isTimeRestricted(timeOfDay)) {
    pills.push({
      key: 'time',
      label: `${formatHour(locale, timeOfDay[0])} – ${formatHour(locale, timeOfDay[1])}`,
      onRemove: () => setTimeOfDay([TIME_MIN, TIME_MAX]),
    })
  }
  languages.forEach((code) => {
    pills.push({
      key: `lang-${code}`,
      label: languageLabel(code),
      onRemove: () => toggleLanguage(code),
    })
  })

  if (pills.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5 px-4 pb-2 pt-1">
      {pills.map((pill) => (
        <FilterPill
          key={pill.key}
          label={pill.label}
          removeLabel={t('filters.remove', { label: pill.label })}
          onRemove={pill.onRemove}
        />
      ))}
    </div>
  )
}
