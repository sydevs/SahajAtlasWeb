import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'

import { dayHeadingParts } from './day-heading'

import { type CalendarEntry, entryTime } from '@/lib/shape'
import { Chip } from '@/components/atoms/Chip'
import { List, ListItem } from '@/components/molecules'
import { formatTimeRange } from '@/lib/time'

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
  chosen = false,
}: {
  day: string
  entries: readonly CalendarEntry[]
  locale: string
  /**
   * The one day a grid picked, rather than one of a week's listed in order: the heading counts
   * its classes, and announces itself as the visitor moves between days.
   */
  chosen?: boolean
}) {
  const { t } = useTranslation()
  const { heading, note } = dayHeadingParts(DateTime.fromISO(day), {
    count: chosen ? entries.length : 0,
    locale,
    t,
  })

  return (
    <section aria-labelledby={`day-${day}`}>
      <h3
        aria-live={chosen ? 'polite' : undefined}
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
                formatTimeRange(entryTime(entry.start), entryTime(entry.end), locale),
                entry.place,
              ]
                .filter(Boolean)
                .join(' · ')}
              href={entry.path}
              label={entry.name}
              tag={entry.online ? <Chip>{t('event.display.online')}</Chip> : undefined}
            />
          ))}
        </List>
      ) : (
        <p className="px-gutter py-4 text-sm text-gray-11">{t('calendar.none')}</p>
      )}
    </section>
  )
}
