import type { CalendarEntry } from '@/lib/shape'

import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'

// "Europe/London" reads as "London".
const viewerZoneName = (): string =>
  (DateTime.local().zoneName ?? 'UTC').split('/').pop()?.replaceAll('_', ' ') ?? 'UTC'

/**
 * Says whose time the entries show, because in-person classes read in the class's own zone and
 * online ones in the viewer's (`eventTimeZone`), so "1:00 AM Toronto" doesn't look like a mistake.
 * It sits under the classes rather than above them, so it costs no first-screen rows, and it shows
 * only when the dates on screen hold an online class.
 */
export function TimesNote({
  entries,
  start,
  end,
}: {
  entries: CalendarEntry[]
  start: string
  end: string
}) {
  const { t } = useTranslation()
  const hasOnline = entries.some((entry) => {
    const date = entry.start.slice(0, 10)

    return entry.calendarId === 'online' && date >= start && date <= end
  })

  if (!hasOnline) return null

  return (
    <p className="shrink-0 border-t border-divider px-4 py-2 text-xs text-gray-11">
      {t('calendar.times_note', { zone: viewerZoneName() })}
    </p>
  )
}
