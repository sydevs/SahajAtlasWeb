import { Summary, type SummaryItem, type SummaryProps } from '@/components/molecules/Summary'
import { CalendarIcon, LocationIcon, MonitorIcon } from '@/components/atoms/Icons'
import { useEventDisplay, type DisplayableEvent } from '@/hooks/use-event-display'

export type EventFactsProps = {
  event: DisplayableEvent
  /** `default` (panel) or `compact` (list card) — passed through to Summary. */
  variant?: SummaryProps['variant']
  className?: string
}

/**
 * The shared event when/where fact block: a calendar line (the repeat pattern +
 * event-local time, with the next date muted below) and a location line (the
 * address, or "Hosted from …" with the viewer's local time faded below for
 * online events). One place so the panel, list card, and share/registration
 * summaries never diverge (issue #52). Ended events drop the location. The
 * compact card variant shows the start time only (no end).
 */
export function EventFacts({ event, variant, className }: EventFactsProps) {
  const {
    display,
    recurrenceLine,
    whenLine,
    eventTimeRange,
    eventStartTime,
    whereLine,
    whereSubtext,
  } = useEventDisplay(event)

  const time = variant === 'compact' ? eventStartTime : eventTimeRange

  // Calendar fact: the repeat pattern + time on the primary line, the concrete
  // next date muted below. One-off/terminal states put the when-line up top.
  const calendar: SummaryItem = recurrenceLine
    ? {
        icon: CalendarIcon,
        text: [recurrenceLine, time].filter(Boolean).join(' · '),
        subtext: display.next ? whenLine : undefined,
      }
    : {
        icon: CalendarIcon,
        text: [whenLine, display.next ? time : null].filter(Boolean).join(' · '),
      }

  const items: SummaryItem[] = [calendar]

  if (whereLine && display.status !== 'ended') {
    items.push({
      icon: display.online ? MonitorIcon : LocationIcon,
      text: whereLine,
      subtext: display.online ? (whereSubtext ?? undefined) : undefined,
    })
  }

  return <Summary className={className} items={items} variant={variant} />
}
