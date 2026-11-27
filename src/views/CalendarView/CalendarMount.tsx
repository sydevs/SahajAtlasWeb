import type { CalendarApp } from '@schedule-x/calendar'
import type { CalendarRenderers, RenderedEntry } from './renderers'

import { useEffect, useRef } from 'react'

// Stands in for `@schedule-x/react`'s `ScheduleXCalendar`, which finds its own mount point
// with `document.getElementById` — `null` inside the embed's shadow root, so the grid never
// rendered while the header above it did. A ref reaches the element through any root. The
// core's own lookups and grid sizing are patched (`patches/@schedule-x__calendar@4.9.1.patch`).
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

    // ⚠ Underscored, but it is the door `@schedule-x/react`'s own `customComponents` goes
    // through. `CalendarMount.test.tsx` fails if an upgrade closes it.
    for (const [slot, render] of Object.entries(renderers ?? {})) {
      calendar._setCustomComponentFn(slot, (host, props) => {
        if (host) render(host, (props as { calendarEvent: RenderedEntry }).calendarEvent)
      })
    }

    calendar.render(element)

    return () => calendar.destroy()
  }, [calendar, renderers])

  return <div ref={ref} className="sx-react-calendar-wrapper" />
}
