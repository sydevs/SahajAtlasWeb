import type { EventAddress } from '@/types'

import { timePeriodRanges, type TimePeriod } from '@/lib/shape'
import { formatTimeRange, wallClock } from '@/lib/time'

/**
 * A directions link from an event's coordinates (preferred) or its address text, undefined when
 * there is nothing to point at. Pure. `apple` is for iPhones and iPads: Google Maps in Safari stops
 * a fresh browser at a consent page first.
 */
export function directionsUrl(
  address: EventAddress | null | undefined,
  apple: boolean,
): string | undefined {
  const { latitude, longitude, street, city, country } = address ?? {}
  const query =
    latitude != null && longitude != null
      ? `${latitude},${longitude}`
      : encodeURIComponent([street, city, country].filter(Boolean).join(', '))

  if (!query) return undefined

  return apple
    ? `https://maps.apple.com/?daddr=${query}`
    : `https://www.google.com/maps/search/?api=1&query=${query}`
}

/**
 * The selected time-of-day periods as hour ranges, written like a class's time
 * (`formatTimeRange`), for the filter form's readout and the active-filter pill. Empty string when
 * nothing is selected.
 */
export function formatTimePeriods(formatLocale: string, periods: readonly TimePeriod[]): string {
  return timePeriodRanges(periods)
    .map(([from, to]) => formatTimeRange(wallClock(from), wallClock(to), formatLocale))
    .join(' · ')
}
