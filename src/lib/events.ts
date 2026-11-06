import type { EventAddress, Geojson } from '@/types'

import { timePeriodRanges, type TimePeriod } from '@/lib/shape'
import { formatTimeRange, regionalLocale, wallClock } from '@/lib/time'

/** iPhone or iPad. iPadOS reports a Mac, so touch points tell the two apart. */
export const isAppleMobile = (
  nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> | undefined = typeof navigator ===
  'undefined'
    ? undefined
    : navigator,
): boolean =>
  Boolean(nav) &&
  (/iPhone|iPad|iPod/.test(nav!.userAgent) ||
    (/Macintosh/.test(nav!.userAgent) && nav!.maxTouchPoints > 1))

/**
 * A directions link from an event's coordinates (preferred) or its address text. This is
 * undefined when there is nothing to point at. iPhones and iPads get Apple Maps: Google in
 * Safari stops a fresh browser at a consent wall. Everything else gets Google Maps.
 */
export function directionsUrl(
  address: EventAddress | null | undefined,
  apple: boolean = isAppleMobile(),
): string | undefined {
  const { latitude, longitude, street, city, country } = address ?? {}
  const text = [street, city, country].filter(Boolean).join(', ')
  const query = latitude != null && longitude != null ? `${latitude},${longitude}` : text

  if (!query) return undefined

  const encoded = query === text ? encodeURIComponent(query) : query

  return apple
    ? `https://maps.apple.com/?daddr=${encoded}`
    : `https://www.google.com/maps/search/?api=1&query=${encoded}`
}

/** A 0–24h value as the wall clock it stands for. 24 wraps to midnight, so an upper bound reads
 *  as a time rather than "24:00". */
const hourClock = (hour: number) => {
  const minutes = Math.round(hour * 60) % (24 * 60)

  return wallClock(Math.floor(minutes / 60), minutes % 60)
}

/**
 * A 0–24h value written like every other time on screen (`formatTimeRange`): "9:30 am" in
 * English, also on a UK browser, whose own clock would say "09:30".
 */
export function formatHour(locale: string, hour: number): string {
  return formatTimeRange(hourClock(hour), null, regionalLocale(locale))
}

/**
 * The selected time-of-day periods as a list of hour ranges ("5:00 pm – 12:00 am"), for the
 * active-filter pill. Empty string when nothing is selected.
 *
 * Each end is written on its own, so each keeps its am or pm. A range across midnight can span
 * more than twelve hours ("5:00 pm – 12:00 pm"), and `formatRange` would drop the first "pm"
 * of a pair sharing one, which reads as a morning start.
 */
export function formatTimePeriods(locale: string, periods: readonly TimePeriod[]): string {
  return timePeriodRanges(periods)
    .map(([from, to]) => `${formatHour(locale, from)} – ${formatHour(locale, to)}`)
    .join(' · ')
}

/** The distinct language codes the feed's classes are held in. */
export const feedLanguageCodes = (feed: Geojson | undefined): string[] => {
  const codes = new Set<string>()

  feed?.features.forEach((feature) =>
    feature.properties.languages.forEach((code) => codes.add(code)),
  )

  return [...codes]
}
