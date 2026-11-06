import type { EventAddress, Geojson } from '@/types'

import { DateTime } from 'luxon'

import { timePeriodRanges, type TimePeriod } from '@/lib/shape'
import { regionalLocale } from '@/lib/time'

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

/**
 * A 0–24h value rendered in the given locale's short time format (e.g. "9:30 AM").
 * 24 wraps to midnight so an upper bound reads as a time rather than "24:00".
 * Shared by the filter form and the active-filter pills for the time-of-day label.
 */
export function formatHour(locale: string, hour: number): string {
  const minutes = Math.round(hour * 60) % (24 * 60)

  return DateTime.fromObject({ hour: Math.floor(minutes / 60), minute: minutes % 60 })
    .setLocale(regionalLocale(locale))
    .toLocaleString(DateTime.TIME_SIMPLE)
}

/**
 * The selected time-of-day periods rendered as a locale-formatted list of hour
 * ranges (e.g. "9:00 AM – 12:00 PM · 5:00 PM – 9:00 PM"), for the filter form's
 * readout and the active-filter pill. Empty string when nothing is selected — the
 * two surfaces stay in lockstep because both format the same `timePeriodRanges`.
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
