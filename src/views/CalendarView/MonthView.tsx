import type { CalendarEntry } from '@/lib/shape'

import { type KeyboardEvent, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'

import { DayClasses } from './EntryList'

import { Chip } from '@/components/atoms/Chip'
import { Link } from '@/components/atoms/Link'
import { entriesByDay, entryTime, monthGrid, todayISO } from '@/lib/shape'
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

// An online class in the class card's own colour, an in-person one in the second. Whole class
// names, so Tailwind sees them.
const kindColor = (entry: CalendarEntry) => (entry.online ? 'primary' : 'secondary')
const DOT = { primary: 'bg-primary-9', secondary: 'bg-secondary-9' }
const PLUS = { primary: 'text-primary-9', secondary: 'text-secondary-9' }

// The day of the month, read off the `yyyy-MM-dd` it is.
const dayOfMonth = (day: string) => Number(day.slice(8))

/** The days of the month on screen, in weeks, with the weekday names over them. */
function useMonthGrid(focused: string, locale: string) {
  const month = focused.slice(0, 7)
  const start = firstWeekday(locale)
  const weeks = useMemo(() => monthGrid(month, start), [month, start])
  // Luxon names Monday first; the grid starts on the locale's own first day.
  const header = useMemo(() => {
    const names = weekdayNames(locale, 'short')

    return Array.from({ length: 7 }, (_, i) => names[(start - 1 + i) % 7])
  }, [locale, start])

  return { month, weeks, header }
}

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
export function MonthView({ isWide, entries, ...props }: MonthViewProps) {
  const byDay = useMemo(() => entriesByDay(entries), [entries])

  return isWide ? <WideMonth byDay={byDay} {...props} /> : <PhoneMonth byDay={byDay} {...props} />
}

type GridProps = Omit<MonthViewProps, 'entries' | 'isWide'> & {
  byDay: Map<string, CalendarEntry[]>
}

function WideMonth({ byDay, focused, locale, onWeekFrom }: GridProps) {
  const { t } = useTranslation()
  const { month, weeks, header } = useMonthGrid(focused, locale)
  const today = todayISO()

  return (
    <table className="w-full table-fixed">
      <thead>
        <tr>
          {header.map((name) => (
            <th key={name} className="pb-2 text-xs font-normal text-gray-11 uppercase" scope="col">
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
                <td key={day} className="h-28 border-t border-divider px-1 pt-1 align-top">
                  <div className="mb-1 text-center">
                    <time
                      className={dayNumber({
                        today: day === today,
                        outside: !day.startsWith(month),
                      })}
                      dateTime={day}
                    >
                      {dayOfMonth(day)}
                    </time>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {classes.slice(0, hidden > 0 ? BOX_ENTRIES - 1 : BOX_ENTRIES).map((entry) => (
                      <MonthBox key={entry.id} entry={entry} locale={locale} />
                    ))}
                  </div>
                  {hidden > 0 && (
                    <button
                      data-vaul-no-drag
                      className="mt-0.5 w-full rounded-lg px-1 text-start text-xs text-gray-11 focus-ring hover:bg-gray-3"
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

// A desktop box fits a time and one short word, and cut class names would read as a column of
// identical "Evening meditation", so the box says where and its name says what.
function MonthBox({ entry, locale }: { entry: CalendarEntry; locale: string }) {
  const { t } = useTranslation()
  const time = formatTimeRange(entryTime(entry.start), null, locale)
  // An online class is anywhere, so its box says so where an in-person one names its town.
  const where = entry.online ? t('event.display.online') : (entry.place ?? entry.name)
  const text = `${time} ${where}`
  const named = where !== entry.name

  return (
    <Link
      aria-label={named ? `${text}, ${entry.name}` : text}
      className="block rounded-lg focus-ring hover:opacity-hover"
      href={entry.path}
      title={named ? `${entry.name} · ${where}` : entry.name}
    >
      <Chip casing="none" className="w-full" color={kindColor(entry)} variant="subtle">
        {text}
      </Chip>
    </Link>
  )
}

// Arrow keys move the chosen day, so the grid is one stop for Tab rather than forty-two.
const STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

function PhoneMonth({ byDay, focused, locale, onFocus }: GridProps) {
  const { t } = useTranslation()
  const grid = useRef<HTMLTableElement>(null)
  const { month, weeks, header } = useMonthGrid(focused, locale)
  const today = todayISO()
  // Named once a month: they do not change with the chosen day.
  const dayNames = useMemo(
    () => new Map(weeks.flat().map((day) => [day, formatLongDate(DateTime.fromISO(day), locale)])),
    [weeks, locale],
  )

  const move = (event: KeyboardEvent) => {
    const step = STEPS[event.key]

    if (!step) return
    event.preventDefault()

    const next = DateTime.fromISO(focused).plus({ days: step }).toISODate()

    // Nothing before today has classes, as the header's arrows already say.
    if (!next || next < today) return
    onFocus(next)
    // The chosen day's button is the grid's one stop; focus follows it once it has rendered,
    // which for a day in the next month is only after the grid has redrawn.
    requestAnimationFrame(() =>
      grid.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus(),
    )
  }

  return (
    <>
      <table ref={grid} className="w-full table-fixed">
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
                const dayClasses = byDay.get(day) ?? []
                const count = dayClasses.length
                const chosen = day === focused

                return (
                  <td key={day}>
                    <button
                      data-vaul-no-drag
                      aria-label={`${dayNames.get(day)}${count ? `, ${t('calendar.day_count', { count })}` : ''}`}
                      aria-pressed={chosen}
                      className={`mx-auto flex h-11 w-11 flex-col items-center justify-center gap-1 rounded-lg focus-ring ${chosen ? 'ring-2 ring-primary-9 ring-inset' : ''}`}
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
                        {dayOfMonth(day)}
                      </span>
                      {/* A dot a class, and past three a plus in the third's place. The row keeps
                          its height on a day with none. */}
                      <span aria-hidden className="flex h-1.5 items-center gap-0.5">
                        {dayClasses.slice(0, count > DOTS ? DOTS - 1 : DOTS).map((entry) => (
                          <span
                            key={entry.id}
                            className={`size-1.5 rounded-full ${DOT[kindColor(entry)]}`}
                          />
                        ))}
                        {count > DOTS && (
                          // Two bars the size of a dot, drawn rather than set in a font or an
                          // icon, so it is as crisp as the dots, in the colour of the last class
                          // it stands for.
                          <span
                            className={`relative size-1.5 before:absolute before:inset-x-0 before:top-1/2 before:h-0.5 before:-translate-y-1/2 before:bg-current after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:bg-current ${PLUS[kindColor(dayClasses[count - 1])]}`}
                          />
                        )}
                      </span>
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="-mx-gutter mt-4">
        <DayClasses counted live day={focused} entries={byDay.get(focused) ?? []} locale={locale} />
      </div>
    </>
  )
}
