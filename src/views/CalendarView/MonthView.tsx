import type { CalendarEntry } from '@/lib/shape'

import { type KeyboardEvent, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'

import { EntryList, entryWallClock } from './EntryList'
import { dayHeadingParts } from './day-heading'

import { Chip } from '@/components/atoms/Chip'
import { Link } from '@/components/atoms/Link'
import { entriesByDay, monthGrid, todayISO } from '@/lib/shape'
import { firstWeekday, formatLongDate, formatTimeRange, weekdayNames } from '@/lib/time'
import { tv } from '@/styles/tv'

// A desktop box fits this many classes; a busier day ends with "+ N classes".
const BOX_ENTRIES = 3
// A phone day shows a dot a class, up to this many.
const DOTS = 3

const dayNumber = tv({
  // A pill wider than it is tall, so today's highlight clears the phone grid's dots below it.
  base: 'inline-flex h-6 min-w-9 items-center justify-center rounded-full px-2 text-sm',
  variants: {
    today: {
      true: 'dark:text-primary-on bg-primary-12 font-semibold text-white dark:bg-primary-9',
    },
    outside: { true: 'text-gray-9' },
  },
})

type MonthViewProps = {
  entries: readonly CalendarEntry[]
  /** The day in view: its month, and on a phone the day whose classes are listed. */
  focused: string
  locale: string
  isWide: boolean
  onFocus: (day: string) => void
  /** A busy day's "+ N classes" opens the Week from that day. */
  onWeekFrom: (day: string) => void
}

/** The calendar's Month: boxes per day on a computer, dots and the chosen day's list on a phone. */
export function MonthView({
  entries,
  focused,
  locale,
  isWide,
  onFocus,
  onWeekFrom,
}: MonthViewProps) {
  const { t } = useTranslation()
  const today = todayISO()
  const start = firstWeekday(locale)
  const weeks = useMemo(() => monthGrid(focused, start), [focused, start])
  const byDay = useMemo(() => entriesByDay(entries), [entries])
  const names = weekdayNames(locale, 'short')
  const month = focused.slice(0, 7)
  // Luxon names Monday first; the grid starts on the locale's own first day.
  const header = Array.from({ length: 7 }, (_, i) => names[(start - 1 + i) % 7])

  if (isWide) {
    return (
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            {header.map((name) => (
              <th
                key={name}
                className="pb-2 text-xs font-normal text-gray-11 uppercase"
                scope="col"
              >
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((day) => {
                const classes = byDay.get(day) ?? []
                const hidden = classes.length - BOX_ENTRIES

                return (
                  <td
                    key={day}
                    className="h-28 border-t border-divider px-1 pt-1 align-top"
                    data-date={day}
                  >
                    <div className="mb-1 text-center">
                      <span
                        aria-label={formatLongDate(DateTime.fromISO(day), locale)}
                        className={dayNumber({
                          today: day === today,
                          outside: !day.startsWith(month),
                        })}
                      >
                        {DateTime.fromISO(day).day}
                      </span>
                    </div>
                    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                      {classes.slice(0, hidden > 0 ? BOX_ENTRIES - 1 : BOX_ENTRIES).map((entry) => (
                        <li key={entry.id}>
                          <MonthBox entry={entry} locale={locale} />
                        </li>
                      ))}
                    </ul>
                    {hidden > 0 && (
                      <button
                        className="mt-0.5 w-full rounded-lg px-1 text-start text-xs text-gray-11 hover:bg-gray-3"
                        type="button"
                        onClick={() => onWeekFrom(day)}
                      >
                        {t('calendar.more', { count: hidden + 1 })}
                      </button>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <PhoneMonth
      byDay={byDay}
      focused={focused}
      header={header}
      locale={locale}
      month={month}
      today={today}
      weeks={weeks}
      onFocus={onFocus}
    />
  )
}

// A desktop box fits a time and one short word, and cut class names would read as a column of
// identical "Evening meditation", so the box says where and its name says what.
function MonthBox({ entry, locale }: { entry: CalendarEntry; locale: string }) {
  const { t } = useTranslation()
  const time = formatTimeRange(entryWallClock(entry.start), null, locale)
  // An online class is anywhere, so its box says so where an in-person one names its town.
  const where = entry.online ? t('event.display.online') : (entry.place ?? entry.name)
  const text = `${time} ${where}`

  return (
    <Link
      aria-label={where === entry.name ? text : `${text}, ${entry.name}`}
      className="block rounded-lg focus-ring hover:opacity-hover"
      href={entry.path}
      title={where === entry.name ? entry.name : `${entry.name} · ${where}`}
    >
      <Chip
        casing="none"
        className="w-full"
        color={entry.online ? 'contrast' : 'primary'}
        variant="subtle"
      >
        {text}
      </Chip>
    </Link>
  )
}

type PhoneMonthProps = {
  weeks: string[][]
  byDay: Map<string, CalendarEntry[]>
  header: string[]
  focused: string
  month: string
  today: string
  locale: string
  onFocus: (day: string) => void
}

// Arrow keys move the chosen day, so the grid is one stop for Tab rather than forty-two.
const STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

function PhoneMonth({
  weeks,
  byDay,
  header,
  focused,
  month,
  today,
  locale,
  onFocus,
}: PhoneMonthProps) {
  const { t } = useTranslation()
  const grid = useRef<HTMLTableElement>(null)
  const classes = byDay.get(focused) ?? []
  const { heading, note } = dayHeadingParts(DateTime.fromISO(focused), {
    count: classes.length,
    locale,
    t,
  })

  const move = (event: KeyboardEvent) => {
    const step = STEPS[event.key]

    if (!step) return
    event.preventDefault()

    const next = DateTime.fromISO(focused).plus({ days: step }).toISODate()

    if (!next) return
    onFocus(next)
    // The chosen day's button is the grid's one stop; focus follows it once it has rendered.
    requestAnimationFrame(() =>
      grid.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus(),
    )
  }

  return (
    <>
      <table ref={grid} className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            {header.map((name) => (
              <th key={name} className="pb-1 text-xs font-normal text-gray-11" scope="col">
                {name.slice(0, 1)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((day) => {
                const classes = byDay.get(day) ?? []
                const count = classes.length
                const chosen = day === focused

                return (
                  <td key={day} className="p-0 text-center">
                    <button
                      aria-label={`${formatLongDate(DateTime.fromISO(day), locale)}${count ? `, ${t('calendar.day_count', { count })}` : ''}`}
                      aria-pressed={chosen}
                      className={`mx-auto flex h-11 w-11 flex-col items-center justify-center gap-1 rounded-lg ${chosen ? 'ring-2 ring-primary-9 ring-inset' : ''}`}
                      data-date={day}
                      tabIndex={chosen ? 0 : -1}
                      type="button"
                      onClick={() => onFocus(day)}
                      onKeyDown={move}
                    >
                      <span
                        className={dayNumber({
                          today: day === today,
                          outside: !day.startsWith(month),
                        })}
                      >
                        {DateTime.fromISO(day).day}
                      </span>
                      {/* One dot a class, up to three, online ones in their own colour. The
                          row keeps its height on a day with none. */}
                      <span aria-hidden className="flex h-1.5 gap-0.5">
                        {classes.slice(0, DOTS).map((entry) => (
                          <span
                            key={entry.id}
                            className={`size-1.5 rounded-full ${entry.online ? 'bg-contrast-9' : 'bg-primary-9'}`}
                          />
                        ))}
                      </span>
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div aria-live="polite" className="mt-5">
        <h3 className="text-lg">{heading}</h3>
        {note && <p className="text-sm text-gray-11">{note}</p>}
      </div>
      {classes.length ? (
        <div className="-mx-gutter mt-2">
          <EntryList entries={classes} locale={locale} />
        </div>
      ) : (
        <p className="mt-4 text-center text-sm text-gray-11">{t('calendar.none')}</p>
      )}
    </>
  )
}
