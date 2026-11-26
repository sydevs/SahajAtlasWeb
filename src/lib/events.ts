import type { EventAddress } from '@/types'

import { timePeriodRanges, type TimePeriod } from '@/lib/shape'
import { formatTimeRange, regionalLocale, wallClock } from '@/lib/time'

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

/** A 0–24h value as the wall clock it stands for. 24 wraps to midnight, so an upper bound reads
 *  as a time rather than "24:00". */
const hourClock = (hour: number) => {
  const minutes = Math.round(hour * 60) % (24 * 60)

  return wallClock(Math.floor(minutes / 60), minutes % 60)
}

/**
 * The selected time-of-day periods as a list of hour ranges, written like a class's time
 * (`formatTimeRange`): "5:00 PM – 12:00 AM" in the US, "17:00–00:00" in the UK. For the filter
 * form's readout and the active-filter pill, so the two stay in lockstep. Empty string when
 * nothing is selected.
 */
export function formatTimePeriods(locale: string, periods: readonly TimePeriod[]): string {
  const formatLocale = regionalLocale(locale)

  return timePeriodRanges(periods)
    .map(([from, to]) => formatTimeRange(hourClock(from), hourClock(to), formatLocale))
    .join(' · ')
}
