import type { CalendarEntry, CalendarWindow } from '@/lib/shape'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'

import { DayClasses } from './DayClasses'

import { Button } from '@/components/atoms/Button'
import { FallbackPanel } from '@/components/molecules'
import { daysBetween, entriesByDay } from '@/lib/shape'
import { formatDate } from '@/lib/time'

type WeekListProps = {
  /** Every class the filters allow, on any date: the week is cut from these. */
  entries: readonly CalendarEntry[]
  week: CalendarWindow
  locale: string
  /** Whether filters other than the place are chosen. */
  filtered: boolean
  onClearFilters: () => void
  onWeekFrom: (day: string) => void
}

/** The Week: the seven days on screen, each day's classes under its date. */
export function WeekList({
  entries,
  week,
  locale,
  filtered,
  onClearFilters,
  onWeekFrom,
}: WeekListProps) {
  const { t } = useTranslation()
  const byDay = useMemo(() => entriesByDay(entries), [entries])
  const days = daysBetween(week.start, week.end).filter((day) => byDay.has(day))

  if (days.length === 0) {
    // `entriesByDay` keeps the days in order.
    const next = [...byDay.keys()].find((day) => day > week.end)

    // The widget's one empty-state table, as the place pages use it: filters that hid every class
    // offer to clear them, and a quiet week offers the next class's week.
    return (
      <FallbackPanel
        align="start"
        kind={filtered ? 'no-results' : 'empty'}
        onClearFilters={onClearFilters}
      >
        {!filtered && next && (
          <Button color="neutral" variant="flat" onClick={() => onWeekFrom(next)}>
            {t('calendar.next_class', { date: formatDate(DateTime.fromISO(next), locale) })}
          </Button>
        )}
      </FallbackPanel>
    )
  }

  return (
    <div className="flex flex-col pb-4">
      {days.map((day) => (
        <DayClasses key={day} day={day} entries={byDay.get(day) ?? []} locale={locale} />
      ))}
    </div>
  )
}
