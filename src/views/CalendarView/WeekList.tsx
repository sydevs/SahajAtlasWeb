import type { CalendarEntry, CalendarWindow } from '@/lib/shape'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'

import { EntryList } from './EntryList'
import { dayHeadingParts } from './day-heading'

import { Button } from '@/components/atoms/Button'
import { daysBetween, entriesByDay } from '@/lib/shape'
import { formatDate } from '@/lib/time'

type WeekListProps = {
  /** Every class the filters allow, on any date: the week is cut from these. */
  entries: readonly CalendarEntry[]
  window: CalendarWindow
  locale: string
  /** Whether filters other than the place and the dates are chosen. */
  filtered: boolean
  onClearFilters: () => void
  onWeekFrom: (day: string) => void
}

/** The Week: the seven days on screen, each day's classes under its date. */
export function WeekList({
  entries,
  window,
  locale,
  filtered,
  onClearFilters,
  onWeekFrom,
}: WeekListProps) {
  const { t } = useTranslation()
  const byDay = useMemo(() => entriesByDay(entries), [entries])
  const days = daysBetween(window.start, window.end).filter((day) => byDay.has(day))

  if (days.length === 0) {
    const next = [...byDay.keys()].sort().find((day) => day > window.end)

    return (
      <div className="flex flex-col items-start gap-3 px-gutter py-6" role="status">
        <p className="text-sm text-gray-12">
          {t(filtered ? 'calendar.none_match_filters' : 'calendar.none_in_window')}
        </p>
        {filtered ? (
          <Button color="neutral" variant="flat" onClick={onClearFilters}>
            {t('calendar.clear_filters')}
          </Button>
        ) : (
          next && (
            <Button color="neutral" variant="flat" onClick={() => onWeekFrom(next)}>
              {t('calendar.next_class', { date: formatDate(DateTime.fromISO(next), locale) })}
            </Button>
          )
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      {days.map((day) => {
        const { heading, note } = dayHeadingParts(DateTime.fromISO(day), { count: 0, locale, t })

        return (
          <section key={day} aria-labelledby={`week-${day}`}>
            <h3
              className="flex items-baseline gap-2 px-gutter text-base font-semibold"
              id={`week-${day}`}
            >
              {heading}
              {note && <span className="text-sm font-normal text-gray-11">{note}</span>}
            </h3>
            <EntryList entries={byDay.get(day) ?? []} locale={locale} />
          </section>
        )
      })}
    </div>
  )
}
