import type { Temporal } from 'temporal-polyfill'
import type { CalendarEntry } from '@/lib/shape'

import { formatTimeRange, wallClock } from '@/lib/time'

/** What Schedule-X hands a renderer: our entry's own fields, and its start and end as it holds them. */
export type RenderedEntry = Pick<CalendarEntry, 'name' | 'detail' | 'calendarId'> &
  Record<'start' | 'end', Temporal.ZonedDateTime>

type CalendarRenderer = (host: HTMLElement, entry: RenderedEntry) => void

/** The Schedule-X slots these fill, each of which hands over an element to write into. */
export type CalendarRenderers = {
  monthAgendaEvent: CalendarRenderer
  monthGridEvent: CalendarRenderer
}

// Schedule-X holds every entry at the class's own wall clock (`timeline.ts`).
const time = (at: Temporal.ZonedDateTime) => wallClock(at.hour, at.minute)

const line = (className: string, text: string): HTMLDivElement => {
  const element = document.createElement('div')

  element.className = className
  element.textContent = text

  return element
}

/** The rows and boxes Schedule-X would otherwise draw itself, with times in `locale`'s format. */
export const calendarRenderers = (locale: string): CalendarRenderers => ({
  // Schedule-X's own row repeats the date the visitor just picked, in a tinted box.
  monthAgendaEvent: (host, entry) => {
    const hours = formatTimeRange(time(entry.start), time(entry.end), locale)

    host.replaceChildren(
      line('sy-entry-name', entry.name),
      line('sy-entry-meta', [hours, entry.detail].filter(Boolean).join(' · ')),
    )
  },
  // A desktop month box fits a time and one short word, and cut class names would read as a
  // column of identical "Evening meditation", so the box says where and its name says what.
  monthGridEvent: (host, entry) => {
    const text = `${formatTimeRange(time(entry.start), null, locale)} ${entry.detail ?? entry.name}`
    const cell = line('sy-entry-cell', text)

    // Schedule-X leaves a custom box untinted, so it takes its calendar's tint itself.
    cell.style.background = `var(--sx-color-${entry.calendarId ?? 'primary'}-container)`
    cell.title = entry.detail ? `${entry.name} · ${entry.detail}` : entry.name
    host.setAttribute('aria-label', entry.detail ? `${text}, ${entry.name}` : text)
    host.replaceChildren(cell)
  },
})
