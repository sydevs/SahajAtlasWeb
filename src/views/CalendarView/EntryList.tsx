import type { CalendarEntry } from '@/lib/shape'

import { DateTime } from 'luxon'

import { List, ListItem } from '@/components/molecules'
import { formatTimeRange } from '@/lib/time'

/** An entry's time, the wall clock of the zone it is shown in (`eventsToCalendarEntries`). */
export const entryWallClock = (at: string) =>
  DateTime.fromFormat(at, 'yyyy-MM-dd HH:mm', { zone: 'UTC' })

/** One day's classes, in the widget's own list rows: the name, then its time and town. */
export function EntryList({
  entries,
  locale,
}: {
  entries: readonly CalendarEntry[]
  locale: string
}) {
  return (
    <List>
      {entries.map((entry) => (
        <ListItem
          key={entry.id}
          description={[
            formatTimeRange(entryWallClock(entry.start), entryWallClock(entry.end), locale),
            entry.detail,
          ]
            .filter(Boolean)
            .join(' · ')}
          href={entry.path}
          label={entry.name}
        />
      ))}
    </List>
  )
}
