import type { CalendarEntry } from '@/lib/shape'

import { DateTime } from 'luxon'
import { useTranslation } from 'react-i18next'

import { useCalendarPosition } from '@/config/store'
import { todayISO } from '@/lib/shape'
import { zoneCity } from '@/lib/time'

/** Whether the month in focus holds an online entry. Entries are `YYYY-MM-DD HH:mm`. */
export const showsOnline = (entries: CalendarEntry[], focused: string): boolean => {
  const month = focused.slice(0, 7)

  return entries.some((entry) => entry.calendarId === 'online' && entry.start.startsWith(month))
}

/**
 * Says whose clock the grid is in. In-person classes read in their own zone and online ones in the
 * viewer's (`eventTimeZone`), so a London visitor's "1:00 AM" Toronto class looks like a mistake
 * without it. It sits under the grid, costing no first-screen rows, and only while the month in
 * focus holds an online class (#25).
 */
export function TimesNote({ entries }: { entries: CalendarEntry[] }) {
  const { t } = useTranslation()
  const focused = useCalendarPosition((s) => s.date) ?? todayISO()

  if (!showsOnline(entries, focused)) return null

  return (
    <p className="shrink-0 border-t border-divider px-4 py-2 text-xs text-gray-11">
      {t('calendar.times_note', { zone: zoneCity(DateTime.local().zoneName) })}
    </p>
  )
}
