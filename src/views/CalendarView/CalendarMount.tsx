import type { CalendarApp } from '@schedule-x/calendar'

import { useEffect, useRef } from 'react'

// Stands in for `@schedule-x/react`'s `ScheduleXCalendar`, which finds its own mount point
// with `document.getElementById` — `null` inside the embed's shadow root, so the grid never
// rendered while the header above it did. A ref reaches the element through any root. The
// core's own lookups and grid sizing are patched (`patches/@schedule-x__calendar@2.36.0.patch`).
export function CalendarMount({ calendar }: { calendar: CalendarApp | null }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current

    if (!calendar || !element) return

    calendar.render(element)

    return () => calendar.destroy()
  }, [calendar])

  return <div ref={ref} className="sx-react-calendar-wrapper" />
}
