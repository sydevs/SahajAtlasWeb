import type { CalendarEntry, CalendarWindow } from '@/lib/shape'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'

import { DayClasses } from './EntryList'

import { Button } from '@/components/atoms/Button'
import { FallbackPanel } from '@/components/molecules'
import { FilterNotice } from '@/components/organisms'
import { daysBetween, entriesByDay } from '@/lib/shape'
import { formatDate } from '@/lib/time'

type WeekListProps = {
  /** Every class the filters allow, on any date: the week is cut from these. */
  entries: readonly CalendarEntry[]
  week: CalendarWindow
  locale: string
  /** Whether filters other than the place and the dates are chosen. */
  filtered: boolean
  onWeekFrom: (day: string) => void
}

/** The Week: the seven days on screen, each day's classes under its date. */
export function WeekList({ entries, week, locale, filtered, onWeekFrom }: WeekListProps) {
  const { t } = useTranslation()
  const byDay = useMemo(() => entriesByDay(entries), [entries])
  const days = daysBetween(week.start, week.end).filter((day) => byDay.has(day))

  if (days.length === 0) {
    // `entriesByDay` keeps the days in order.
    const next = [...byDay.keys()].find((day) => day > week.end)

    // Filters that hid every class say so as every list does; a quiet week offers the next
    // class's week.
    if (filtered) return <FilterNotice kind="no-match" />

    return (
      <FallbackPanel align="start" kind="empty">
        {next && (
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
