import type { CalendarEntry } from '@/lib/shape'

import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'

import { zoneCity } from '@/lib/time'

/**
 * Says whose clock the times on screen are in, by city, never "your time" (Anton, 6 Nov): an
 * in-person class reads in its own zone and an online one in the viewer's (`eventTimeZone`), so
 * "1:00 am" for a Toronto class doesn't look like a mistake. It names one city when every
 * in-person class on screen shares a zone ("Times are London time."), and only when that clock
 * differs from the viewer's. It sits under the classes rather than above them, so it costs no
 * first-screen rows, and says nothing when there is nothing to say.
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
  const now = DateTime.now()
  const shown = entries.filter((entry) => {
    const date = entry.start.slice(0, 10)

    return date >= start && date <= end
  })
  const hasOnline = shown.some((entry) => entry.calendarId === 'online')
  const zones = new Set(
    shown.filter((entry) => entry.calendarId !== 'online').map((entry) => entry.zone),
  )
  const differs = [...zones].some((zone) => now.setZone(zone).offset !== now.offset)
  const [onlyZone] = zones

  const sentences = [
    differs && zones.size === 1
      ? t('calendar.times_city', { city: zoneCity(onlyZone) })
      : differs
        ? t('calendar.times_local')
        : null,
    hasOnline ? t('calendar.times_online', { city: zoneCity(now.zoneName) }) : null,
  ].filter(Boolean)

  if (sentences.length === 0) return null

  return (
    <p className="shrink-0 border-t border-divider px-4 py-2 text-xs text-gray-11">
      {sentences.join(' ')}
    </p>
  )
}
