import type { EventAddress } from '@/types'

import { timePeriodRanges, type TimePeriod } from '@/lib/shape'
import { formatTimeRange, wallClock } from '@/lib/time'

/**
 * A Google Maps directions link from an event's coordinates (preferred) or its
 * address text. This is undefined when there is nothing to point at. Pure —
 * shared by the panel's Directions action and any future card affordance.
 */
export function directionsUrl(address: EventAddress | null | undefined): string | undefined {
  const { latitude, longitude, street, city, country } = address ?? {}

  if (latitude != null && longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
  }

  const query = [street, city, country].filter(Boolean).join(', ')

  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : undefined
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
