import { timePeriodRanges, type TimePeriod } from '@/lib/shape'
import { formatTimeRange, wallClock } from '@/lib/time'

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
