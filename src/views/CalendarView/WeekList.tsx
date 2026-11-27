import type { CalendarEntry, CalendarWindow } from '@/lib/shape'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'

import { EntryList } from './EntryList'
import { dayHeadingParts } from './day-heading'

import { Button } from '@/components/atoms/Button'
import { FallbackPanel } from '@/components/molecules'
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
      {days.map((day) => {
        const { heading, note } = dayHeadingParts(DateTime.fromISO(day), { count: 0, locale, t })

        return (
          <section key={day} aria-labelledby={`week-${day}`}>
            {/* A band across the list, held at the top while its day scrolls, so each day reads
                as its own section rather than one more row. */}
            <h3
              className="sticky top-0 z-10 flex items-baseline gap-2 bg-gray-3 px-gutter py-2 text-sm font-semibold text-gray-12"
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
