import type { TFunction } from 'i18next'

import { DateTime } from 'luxon'

import { formatDayHeading, formatRelativeDate } from '@/lib/time'

export type DayHeadingParts = {
  /** The day itself, compact: "Thursday 12 Nov" in the UK, "Thursday, Nov 12" in the US. */
  heading: string
  /** The quieter line under it: "Today · 4 classes", "Tomorrow", "2 classes", or empty. */
  note: string
}

/**
 * The phone month list's heading for the day it shows. The date leads, and "Today" or "Tomorrow"
 * and the day's count follow on a quieter line, which keeps the heading short.
 */
export function dayHeadingParts(
  day: DateTime,
  { count, locale, t }: { count: number; locale: string; t: TFunction },
): DayHeadingParts {
  const today = DateTime.now().setZone(day.zone).startOf('day')
  const away = Math.round(day.startOf('day').diff(today, 'days').days)
  const relative = away === 0 || away === 1 ? formatRelativeDate(day, locale, 'days') : null
  const classes = count > 0 ? t('calendar.day_count', { count }) : null

  return {
    heading: formatDayHeading(day, locale),
    note: [relative, classes].filter(Boolean).join(' · '),
  }
}
