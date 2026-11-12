import { useMemo } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'

import { DayHeading } from './DayHeading'
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
import { formatDate, formatTime, regionalLocale } from '@/lib/time'

const WALL_CLOCK = 'yyyy-MM-dd HH:mm'

function WeekRow({ entry }: { entry: CalendarEntry }) {
  const { locale } = useLocale()
  const time = formatTime(
    DateTime.fromFormat(entry.start, WALL_CLOCK, { zone: 'UTC' }),
    regionalLocale(locale),
  )

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

// The calendar's Week view: the classes in a window of seven days, by day, each day headed by its
// date with "Today" or "Tomorrow" beside it (`DayHeading`). It reads the feed without the date range and cuts the
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

  // "6 Nov" on a UK browser, "Nov 6" on a US one, like the times.
  const shortDate = (date: string) =>
    formatDate(DateTime.fromISO(date), regionalLocale(locale), { weekday: false })

  if (days.length === 0) {
    const filtered = activeFilterCount(chosenCalendarFilters(filters, true)) > 0
    const next = entries
      .filter((entry) => entry.start.slice(0, 10) > window.end)
      .reduce<
        string | null
      >((soonest, entry) => (!soonest || entry.start.slice(0, 10) < soonest ? entry.start.slice(0, 10) : soonest), null)

    return (
      <DrawerBody className="px-gutter py-4">
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
      {/* Above the times it explains, so it is read first, not found under the list. */}
      <TimesNote entries={days.flatMap((day) => day.entries)} />
      <DrawerBody className="pb-4">
        {days.map((day) => (
          <section key={day.date}>
            <DayHeading date={day.date} />
            <List>
              {day.entries.map((entry) => (
                <WeekRow key={entry.id} entry={entry} />
              ))}
            </List>
          </section>
        ))}
      </DrawerBody>
    </>
  )
}
