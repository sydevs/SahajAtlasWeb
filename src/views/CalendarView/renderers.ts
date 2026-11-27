import type { Temporal } from 'temporal-polyfill'

import { DateTime } from 'luxon'

import { formatTimeRange } from '@/lib/time'

/** What Schedule-X hands a renderer: our entry's own fields, and its start and end as it holds them. */
export type RenderedEntry = {
  name?: string
  detail?: string
  calendarId?: string
  start: Temporal.ZonedDateTime
  end: Temporal.ZonedDateTime
}

export type CalendarRenderer = (host: HTMLElement, entry: RenderedEntry) => void

/** The Schedule-X slots these fill, each of which hands over an element to write into. */
export type CalendarRenderers = {
  monthAgendaEvent: CalendarRenderer
  monthGridEvent: CalendarRenderer
}

// Schedule-X holds every entry in the viewer's zone at the class's own wall clock (`timeline.ts`),
// so the wall clock is all a time reads.
const wallClock = (at: Temporal.ZonedDateTime): DateTime =>
  DateTime.utc(at.year, at.month, at.day, at.hour, at.minute)

const line = (className: string, text: string): HTMLDivElement => {
  const element = document.createElement('div')

  element.className = className
  element.textContent = text

  return element
}

/** The rows and boxes Schedule-X would otherwise draw itself, with times in `locale`'s format. */
export const calendarRenderers = (locale: string): CalendarRenderers => ({
  // The phone month list: the class name, then its time and where it is. Schedule-X's own row
  // repeats the date the visitor just picked, in a tinted box.
  monthAgendaEvent: (host, entry) => {
    const hours = formatTimeRange(wallClock(entry.start), wallClock(entry.end), locale)

    host.replaceChildren(
      line('sy-entry-name', entry.name ?? ''),
      line('sy-entry-meta', [hours, entry.detail].filter(Boolean).join(' · ')),
    )
  },
  // A desktop month box fits a time and one short word, and cut class names read as a column of
  // identical "Evening meditation", so the box says where and pointing at it says what.
  monthGridEvent: (host, entry) => {
    const start = formatTimeRange(wallClock(entry.start), null, locale)
    const cell = line('sy-entry-cell', `${start} ${entry.detail ?? entry.name ?? ''}`)

    cell.title = [entry.name, entry.detail].filter(Boolean).join(' · ')
    cell.dataset.online = String(entry.calendarId === 'online')
    host.replaceChildren(cell)
  },
})
