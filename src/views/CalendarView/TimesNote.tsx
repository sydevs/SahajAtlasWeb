import type { CalendarEntry } from '@/lib/shape'

import { useTranslation } from 'react-i18next'

import { zoneCity } from '@/lib/time'

/**
 * Says whose clock the times on screen are in, by city, never "your time" (Anton, 6 Nov): an
 * in-person class reads in its own zone and an online one in the viewer's (`eventTimeZone`), so
 * "1:00 am" for a Toronto class doesn't look like a mistake. One clock for everything on screen is
 * one sentence ("Times are London time."); otherwise the in-person clock, or "each class's local
 * time" when they differ, then the online one.
 *
 * It always names the clock, as each class page does, so it never weighs the viewer's offset
 * TODAY against classes weeks away, across a daylight-saving change. It sits above the times,
 * under the calendar's own header, so it is read before them rather than found under a long list,
 * and says nothing when no class is on screen.
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
  const shown = entries.filter((entry) => {
    const date = entry.start.slice(0, 10)

    return date >= start && date <= end
  })

  if (shown.length === 0) return null

  // An online entry's zone is the viewer's: that is the zone its times were read in.
  const zones = new Set(shown.map((entry) => entry.zone))
  const placeZones = new Set(
    shown.filter((entry) => entry.calendarId !== 'online').map((entry) => entry.zone),
  )
  const onlineZone = shown.find((entry) => entry.calendarId === 'online')?.zone
  const [onlyZone] = zones
  const [onlyPlaceZone] = placeZones

  const sentences =
    zones.size === 1
      ? [t('calendar.times_city', { city: zoneCity(onlyZone) })]
      : [
          placeZones.size === 1
            ? t('calendar.times_city', { city: zoneCity(onlyPlaceZone) })
            : t('calendar.times_local'),
          onlineZone ? t('calendar.times_online', { city: zoneCity(onlineZone) }) : null,
        ].filter(Boolean)

  return <p className="shrink-0 px-gutter pb-2 text-xs text-gray-11">{sentences.join(' ')}</p>
}
