import { useMemo } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'

import { TimesNote } from './TimesNote'

import { Button } from '@/components/atoms/Button'
import { DrawerBody } from '@/components/atoms/Drawer'
import { Link } from '@/components/atoms/Link'
import { List } from '@/components/molecules'
import { listRow } from '@/components/molecules/List/List'
import { calendarQuery } from '@/config/api'
import { useSetFilters } from '@/hooks/use-filters'
import { useLocale } from '@/hooks/use-locale'
import {
  type CalendarEntry,
  DEFAULT_FILTERS,
  type EventFilters,
  activeFilterCount,
  calendarWindow,
  chosenCalendarFilters,
  eventsToCalendarEntries,
  groupEntriesByDay,
  todayISO,
  weekFrom,
} from '@/lib/shape'

const WALL_CLOCK = 'yyyy-MM-dd HH:mm'

function WeekRow({ entry }: { entry: CalendarEntry }) {
  const { locale } = useLocale()
  const time = DateTime.fromFormat(entry.start, WALL_CLOCK)
    .setLocale(locale)
    .toLocaleString(DateTime.TIME_SIMPLE)

  return (
    <li>
      <Link className={listRow({ className: 'flex min-h-14 gap-3 py-3' })} href={entry.path}>
        <span className="w-[68px] shrink-0 pt-px text-sm text-gray-11 tabular-nums">{time}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg">{entry.name}</span>
          {entry.detail && (
            <span className="mt-0.5 block text-sm font-normal text-gray-11">{entry.detail}</span>
          )}
        </span>
      </Link>
    </li>
  )
}

// The calendar's List view: the classes in a window of days, by day, under the plain words a
// person uses (Today, Tomorrow, Saturday). It reads the feed without the date range and cuts the
// window itself, so paging a week is instant and an empty week can name the next class.
export function WeekList({ filters }: { filters: EventFilters }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const { setDateRange, setFilters } = useSetFilters()
  const undated = useMemo(() => ({ ...filters, dateRange: { start: null, end: null } }), [filters])
  const { data: source } = useSuspenseQuery(calendarQuery(undated, locale))

  const today = todayISO()
  const window = calendarWindow(filters.dateRange, today)
  const onlineLabel = t('event.display.online')
  const entries = useMemo(
    () => eventsToCalendarEntries(source, undated, { onlineLabel }),
    [source, undated, onlineLabel],
  )
  const days = groupEntriesByDay(entries, window)

  const dayName = (date: string) => {
    const day = DateTime.fromISO(date).setLocale(locale)

    if (date === today) return t('calendar.today')
    if (date === DateTime.fromISO(today).plus({ days: 1 }).toISODate())
      return t('calendar.tomorrow')

    return day.toLocaleString({ weekday: 'long' })
  }
  const shortDate = (date: string) =>
    DateTime.fromISO(date).setLocale(locale).toLocaleString({ day: 'numeric', month: 'short' })

  if (days.length === 0) {
    const filtered = activeFilterCount(chosenCalendarFilters(filters, true)) > 0
    const next = entries
      .filter((entry) => entry.start.slice(0, 10) > window.end)
      .reduce<
        string | null
      >((soonest, entry) => (!soonest || entry.start.slice(0, 10) < soonest ? entry.start.slice(0, 10) : soonest), null)

    return (
      <DrawerBody className="p-4">
        <p className="text-base text-gray-11">
          {filtered ? t('calendar.none_match_filters') : t('calendar.none_in_window')}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {next && (
            <Button color="primary" variant="flat" onClick={() => setDateRange(weekFrom(next))}>
              {t('calendar.next_class', { date: shortDate(next) })}
            </Button>
          )}
          {filtered && (
            <Button
              variant="ghost"
              onClick={() =>
                setFilters({
                  ...DEFAULT_FILTERS,
                  region: filters.region,
                  dateRange: filters.dateRange,
                })
              }
            >
              {t('calendar.clear_filters')}
            </Button>
          )}
        </div>
      </DrawerBody>
    )
  }

  return (
    <>
      <DrawerBody className="pb-4">
        {days.map((day) => (
          <section key={day.date}>
            <h3 className="sticky top-0 z-10 flex items-baseline gap-2 bg-gray-2 px-4 py-2 text-sm font-semibold">
              {dayName(day.date)}
              <span className="font-normal text-gray-11">{shortDate(day.date)}</span>
            </h3>
            <List>
              {day.entries.map((entry) => (
                <WeekRow key={entry.id} entry={entry} />
              ))}
            </List>
          </section>
        ))}
      </DrawerBody>
      <TimesNote end={window.end} entries={entries} start={window.start} />
    </>
  )
}
