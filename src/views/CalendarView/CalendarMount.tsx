import type { CalendarApp } from '@schedule-x/calendar'

import { useEffect, useRef } from 'react'

/** The fields of a calendar entry a custom row or cell reads. */
export type CalendarRowEntry = {
  name?: string
  detail?: string
  place?: string
  calendarId?: string
  start: string
  end: string
}
export type CalendarRowRenderer = (host: HTMLElement, entry: CalendarRowEntry) => void
/** What fills Schedule-X's row and cell slots, which hand over an element to write into. */
export type CalendarRenderers = {
  monthAgendaEvent: CalendarRowRenderer
  monthGridEvent: CalendarRowRenderer
}

// Stands in for `@schedule-x/react`'s `ScheduleXCalendar`, which finds its own mount point
// with `document.getElementById` — `null` inside the embed's shadow root, so the grid never
// rendered while the header above it did. A ref reaches the element through any root. The
// core's own lookups and grid sizing are patched (`patches/@schedule-x__calendar@2.36.0.patch`).
export function CalendarMount({
  calendar,
  renderers,
}: {
  calendar: CalendarApp | null
  renderers?: CalendarRenderers
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current

    if (!calendar || !element) return

    if (renderers) {
      for (const [slot, render] of Object.entries(renderers)) {
        calendar._setCustomComponentFn(slot as keyof CalendarRenderers, (host, props) => {
          const { calendarEvent } = props as { calendarEvent: CalendarRowEntry }

          if (host) render(host, calendarEvent)
        })
      }
    }

    calendar.render(element)

    return () => calendar.destroy()
  }, [calendar, renderers])

  return <div ref={ref} className="sx-react-calendar-wrapper" />
}
