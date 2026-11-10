import type { CalendarEntry } from '@/lib/shape'

import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'

import { zoneCity } from '@/lib/time'

/**
 * Says whose clock the times on screen are in: an in-person class reads in its own zone and an
 * online one in the viewer's (`eventTimeZone`), so a London visitor's 1:00 am Toronto class looks
 * like a mistake without it (#25, #380). It shows only when an online class is among `entries`,
 * naming the viewer's city for those, and says nothing otherwise: a class page names a venue's
 * clock itself when the viewer's differs. It sits above the times it explains, so it is read
 * before them rather than found under a long list.
 */
export function TimesNote({ entries }: { entries: readonly CalendarEntry[] }) {
  const { t } = useTranslation()

  if (!entries.some((entry) => entry.calendarId === 'online')) return null

  return (
    <p className="shrink-0 px-gutter pb-2 text-xs text-gray-11">
      {t('calendar.times_note', { zone: zoneCity(DateTime.local().zoneName) })}
    </p>
  )
}
