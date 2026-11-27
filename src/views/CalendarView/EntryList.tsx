import type { CalendarEntry } from '@/lib/shape'

import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'

import { Chip } from '@/components/atoms/Chip'
import { List, ListItem } from '@/components/molecules'
import { formatTimeRange } from '@/lib/time'

/** An entry's time, the wall clock of the zone it is shown in (`eventsToCalendarEntries`). */
export const entryWallClock = (at: string) =>
  DateTime.fromFormat(at, 'yyyy-MM-dd HH:mm', { zone: 'UTC' })

/**
 * One day's classes, in the widget's own list rows: the name, then its time and town. An online
 * class says so with a chip, because its time is the visitor's own and would otherwise look wrong.
 */
export function EntryList({
  entries,
  locale,
}: {
  entries: readonly CalendarEntry[]
  locale: string
}) {
  const { t } = useTranslation()

  return (
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
              <Chip casing="none" color="contrast" variant="subtle">
                {t('event.display.online')}
              </Chip>
            ) : undefined
          }
        />
      ))}
    </List>
  )
}
