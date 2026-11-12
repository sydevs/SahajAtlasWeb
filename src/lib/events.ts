import type { EventAddress, Geojson } from '@/types'

import { timePeriodRanges, type TimePeriod } from '@/lib/shape'
import { formatTime, formatTimeRange, regionalLocale, wallClock } from '@/lib/time'

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

/** A 0–24h value written like every other time on screen: "9:30 AM" in the US, "09:30" in the UK. */
export function formatHour(locale: string, hour: number): string {
  return formatTime(hourClock(hour), regionalLocale(locale))
}

/**
 * The selected time-of-day periods as a list of hour ranges, written like a class's time
 * (`formatTimeRange`): "5:00 PM – 12:00 AM" in the US, "17:00–00:00" in the UK. For the
 * active-filter pill. Empty string when nothing is selected.
 */
export function formatTimePeriods(locale: string, periods: readonly TimePeriod[]): string {
  return timePeriodRanges(periods)
    .map(([from, to]) => formatTimeRange(hourClock(from), hourClock(to), regionalLocale(locale)))
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
