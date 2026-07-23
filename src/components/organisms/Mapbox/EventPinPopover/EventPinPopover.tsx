import type { DisplayableEvent } from '@/hooks/use-event-display'

import { Popup } from 'react-map-gl'

import { CalendarIcon } from '@/components/atoms/Icons'
import { composeCalendarLine, useEventDisplay } from '@/hooks/use-event-display'

export type EventPinPopoverProps = {
  /** The full feed event the hovered pin re-joins to (from the `['geojson']`
   *  cache) — it carries the schedule the trimmed map source drops. */
  event: DisplayableEvent
  longitude: number
  latitude: number
}

/**
 * A non-interactive hover popover over an individual event pin, showing that
 * event's timing line — recurrence · start time (e.g. "Every Thursday · 7:30
 * PM") — the SAME compact calendar line the list card shows, from the shared
 * `composeCalendarLine` formatter (#72), so the two can never drift. It carries
 * no title, so the locale-agnostic feed event alone is enough (no titles sliver).
 *
 * Rendered only for `unclustered-point` pins (never clusters — one recurrence
 * line is meaningless for a cluster of events); the caller re-joins the hovered
 * pin's id to the full feed event and mounts this once for the one hovered pin (a
 * hook can't run per-feature in a loop). `pointer-events: none` (set on the popup
 * in globals.css) keeps it from stealing hover from the pin beneath it or
 * blocking tap-to-open, and `focusAfterOpen={false}` stops it grabbing focus.
 */
export function EventPinPopover({ event, longitude, latitude }: EventPinPopoverProps) {
  const { display, recurrenceLine, whenLine, eventStartTime } = useEventDisplay(event)
  const line = composeCalendarLine({
    recurrenceLine,
    whenLine,
    time: eventStartTime,
    hasNext: Boolean(display.next),
  })

  if (!line) return null

  return (
    <Popup
      anchor="bottom"
      className="event-pin-popover"
      closeButton={false}
      closeOnClick={false}
      focusAfterOpen={false}
      latitude={latitude}
      longitude={longitude}
      offset={34}
    >
      <div className="flex items-center gap-1.5 rounded-lg border border-divider bg-background px-2.5 py-1.5 text-sm font-medium leading-snug text-foreground shadow-md">
        <CalendarIcon className="shrink-0 text-gray-11" size={16} />
        <span>{line}</span>
      </div>
    </Popup>
  )
}
