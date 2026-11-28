import type { TFunction } from 'i18next'

import { DateTime } from 'luxon'

import { formatDate, formatRelativeDate } from '@/lib/time'

/**
 * The phone month list's heading for the day it shows. The date leads, and "Today" or "Tomorrow"
 * and the day's count follow on a quieter note ("Today · 4 classes"), which keeps the heading short.
 */
export function dayHeadingParts(
  day: DateTime,
  { count, locale, t }: { count: number; locale: string; t: TFunction },
): { heading: string; note: string } {
  const today = DateTime.now().setZone(day.zone).startOf('day')
  const away = Math.round(day.startOf('day').diff(today, 'days').days)
  const relative = away === 0 || away === 1 ? formatRelativeDate(day, locale, 'days') : null
  const classes = count > 0 ? t('calendar.day_count', { count }) : null

  return {
    heading: formatDate(day, locale, { weekday: 'long' }),
    note: [relative, classes].filter(Boolean).join(' · '),
  }
}
