import type { DisplayableEvent } from '@/hooks/use-event-display'

import { Popup } from 'react-map-gl'

import { CalendarIcon } from '@/components/atoms/Icons'
import { useEventDisplay } from '@/hooks/use-event-display'

export type EventPinCardProps = {
  event: DisplayableEvent
}

/**
 * The popover's visual card: a calendar glyph beside the event's timing, with the
 * recurrence (e.g. "Every Thursday") stacked above its start time so the card
 * stays narrow. Purely presentational — no map dependency — so it previews
 * standalone. Its timing mirrors `composeCalendarLine`'s branches (#72), just
 * broken across two lines instead of joined with a `·`: the recurrence (or the
 * fallback when-line) leads, and the start time only follows a non-recurring line
 * when there's a next session.
 */
export function EventPinCard({ event }: EventPinCardProps) {
  const { display, recurrenceLine, whenLine, eventStartTime } = useEventDisplay(event)

  const primary = recurrenceLine ?? whenLine
  const time = recurrenceLine || display.next ? eventStartTime : null

  if (!primary) return null

  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-divider bg-background px-2.5 py-1.5 text-foreground shadow-md">
      <CalendarIcon className="shrink-0 text-gray-11" size={16} />
      <div className="flex flex-col text-sm font-medium leading-tight">
        <span>{primary}</span>
        {time && <span className="text-xs font-normal text-gray-11">{time}</span>}
      </div>
    </div>
  )
}

export type EventPinPopoverProps = EventPinCardProps & {
  longitude: number
  latitude: number
}

/**
 * A non-interactive hover popover over an individual event pin, showing that
 * event's timing (recurrence stacked above start time) via {@link EventPinCard}.
 * It carries no title, so the locale-agnostic feed event alone is enough (no
 * titles sliver).
 *
 * Rendered only for `unclustered-point` pins (never clusters — one recurrence
 * line is meaningless for a cluster of events); the caller re-joins the hovered
 * pin's id to the full feed event and mounts this once for the one hovered pin (a
 * hook can't run per-feature in a loop). `pointer-events: none` (set on the popup
 * in globals.css) keeps it from stealing hover from the pin beneath it or
 * blocking tap-to-open, and `focusAfterOpen={false}` stops it grabbing focus.
 */
export function EventPinPopover({ event, longitude, latitude }: EventPinPopoverProps) {
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
      <EventPinCard event={event} />
    </Popup>
  )
}
