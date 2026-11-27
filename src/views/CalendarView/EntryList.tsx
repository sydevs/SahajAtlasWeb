import type { CalendarEntry } from '@/lib/shape'

import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'

import { dayHeadingParts } from './day-heading'

import { Chip } from '@/components/atoms/Chip'
import { List, ListItem } from '@/components/molecules'
import { formatTimeRange } from '@/lib/time'

/** An entry's time, the wall clock of the zone it is shown in (`eventsToCalendarEntries`). */
export const entryWallClock = (at: string) =>
  DateTime.fromFormat(at, 'yyyy-MM-dd HH:mm', { zone: 'UTC' })

/**
 * One day of classes, as both the Week and the phone Month list it: the date in a band held at
 * the top while its classes scroll, then each class in the widget's own list rows, its name and
 * then its time and town. An online class carries the same Online chip a class card does, since its
 * time is the visitor's own and would otherwise look wrong.
 */
export function DayClasses({
  day,
  entries,
  locale,
  counted = false,
}: {
  day: string
  entries: readonly CalendarEntry[]
  locale: string
  /** Says how many classes the day holds beside the date, where no list says it already. */
  counted?: boolean
}) {
  const { t } = useTranslation()
  const { heading, note } = dayHeadingParts(DateTime.fromISO(day), {
    count: counted ? entries.length : 0,
    locale,
    t,
  })

  return (
    <section aria-labelledby={`day-${day}`}>
      <h3
        className="sticky top-0 z-10 flex items-baseline gap-2 bg-gray-3 px-gutter py-2 text-sm font-semibold text-gray-12"
        id={`day-${day}`}
      >
        {heading}
        {note && <span className="font-normal text-gray-11">{note}</span>}
      </h3>
      {entries.length ? (
        <List>
          {entries.map((entry) => (
            <ListItem
              key={entry.id}
              description={[
                formatTimeRange(entryWallClock(entry.start), entryWallClock(entry.end), locale),
                entry.place,
              ]
                .filter(Boolean)
                .join(' · ')}
              href={entry.path}
              label={entry.name}
              tag={
                entry.online ? (
                  // Inline in the name, so no 44px touch floor: a label, not a control.
                  <Chip className="pointer-coarse:min-h-0">{t('event.display.online')}</Chip>
                ) : undefined
              }
            />
          ))}
        </List>
      ) : (
        <p className="px-gutter py-4 text-sm text-gray-11">{t('calendar.none')}</p>
      )}
    </section>
  )
}
