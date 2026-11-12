import type { TFunction } from 'i18next'

import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'

import { useLocale } from '@/hooks/use-locale'
import { todayISO } from '@/lib/shape'
import { formatDayHeading, regionalLocale } from '@/lib/time'

export type DayHeadingParts = {
  /** The day itself, compact: "Thursday, Nov 12" in the US, "Thursday 12 Nov" in the UK. */
  heading: string
  /** The quieter line under it: "Today · 4 classes", "Tomorrow", or empty. */
  note: string
}

/**
 * A calendar day's heading: the date leads, and "Today" or "Tomorrow" and the class count follow
 * as a quieter note, so the heading stays short and the hierarchy is clear (Devindra, 12 Nov).
 * `count` is left out where the classes are listed right under it anyway.
 */
export function dayHeadingParts(
  date: string,
  { today, locale, t, count }: { today: string; locale: string; t: TFunction; count?: number },
): DayHeadingParts {
  const relative =
    date === today
      ? t('calendar.today')
      : date === DateTime.fromISO(today).plus({ days: 1 }).toISODate()
        ? t('calendar.tomorrow')
        : null

  return {
    heading: formatDayHeading(DateTime.fromISO(date), locale, { now: DateTime.fromISO(today) }),
    note: [relative, count ? t('calendar.day_count', { count }) : null].filter(Boolean).join(' · '),
  }
}

/** The week list's sticky day heading, built from {@link dayHeadingParts}. */
export function DayHeading({ date }: { date: string }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const { heading, note } = dayHeadingParts(date, {
    today: todayISO(),
    locale: regionalLocale(locale),
    t,
  })

  return (
    <h3 className="sticky top-0 z-10 flex items-baseline gap-2 bg-gray-2 px-gutter py-2 text-sm font-semibold">
      {heading}
      {note && <span className="font-normal text-gray-11">{note}</span>}
    </h3>
  )
}
