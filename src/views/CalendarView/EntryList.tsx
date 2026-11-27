import type { CalendarEntry } from '@/lib/shape'

import { DateTime } from 'luxon'

import { List, ListRow } from '@/components/molecules/List'
import { formatTimeRange } from '@/lib/time'

/** An entry's time, the wall clock of the zone it is shown in (`eventsToCalendarEntries`). */
export const entryWallClock = (at: string) =>
  DateTime.fromFormat(at, 'yyyy-MM-dd HH:mm', { zone: 'UTC' })

/** One day's classes, as the widget's other lists draw a row: the name, then its time and town. */
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
        <ListRow key={entry.id} className="gap-3 py-3" href={entry.path}>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-gray-12">{entry.name}</div>
            <div className="text-sm text-gray-11">
              {[
                formatTimeRange(entryWallClock(entry.start), entryWallClock(entry.end), locale),
                entry.detail,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
        </ListRow>
      ))}
    </List>
  )
}
