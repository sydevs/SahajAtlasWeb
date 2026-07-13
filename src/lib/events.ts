import { DateTime } from 'luxon'

/**
 * Whether an event's next occurrence is "starting soon": within the next hour
 * for online events, or within the next week for in-person ones.
 *
 * A pure predicate (no React, no i18n) so non-UI consumers can use it without
 * pulling in a component — e.g. `EventsList` weights its relevance sort with it,
 * and `EventSoonChip` decides whether to render from it.
 */
export function isSoon(nextDate: DateTime, online: boolean) {
  const unit = online ? 'hours' : 'weeks'
  const diff = nextDate.diffNow([unit]).get(unit)

  return 0 < diff && diff < 1
}

/**
 * Luxon-formatted timezone strings for a given time, used to label and annotate
 * a timezone chip:
 *
 * - `abbreviation` — short name shown on the chip (e.g. `GMT+1`)
 * - `name` — long, localized name for the tooltip (e.g. `British Summer Time`)
 * - `offset` — UTC offset for the tooltip (e.g. `+1`)
 */
export function formatTimeZone(time: DateTime) {
  return {
    abbreviation: time.toFormat('ZZZZ'),
    name: time.toFormat('ZZZZZ'),
    offset: time.toFormat('Z'),
  }
}

/**
 * A 0–24h value rendered in the given locale's short time format (e.g. "9:30 AM").
 * 24 wraps to midnight so an upper bound reads as a time rather than "24:00".
 * Shared by the filter form and the active-filter pills for the time-of-day label.
 */
export function formatHour(locale: string, hour: number): string {
  const minutes = Math.round(hour * 60) % (24 * 60)

  return DateTime.fromObject({ hour: Math.floor(minutes / 60), minute: minutes % 60 })
    .setLocale(locale)
    .toLocaleString(DateTime.TIME_SIMPLE)
}
