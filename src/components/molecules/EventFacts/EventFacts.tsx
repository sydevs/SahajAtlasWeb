import type { ReactNode } from 'react'

import { Summary, type SummaryItem, type SummaryProps } from '@/components/molecules/Summary'
import { CalendarIcon, LocationIcon, MonitorIcon } from '@/components/atoms/Icons'
import { useEventDisplay, type DisplayableEvent } from '@/hooks/use-event-display'

export type EventFactsProps = {
  event: DisplayableEvent
  /** `default` (panel) or `compact` (list card) — passed through to Summary. */
  variant?: SummaryProps['variant']
  /** Distance from the searched location, shown faded under the address (list
   *  cards only — the panel has no search origin to measure from). */
  distance?: ReactNode
  className?: string
}

/**
 * The shared event when/where fact block: a calendar line (the repeat pattern +
 * event-local time, with a muted detail below) and a location line (the address
 * with its distance faded below, or "Online • Hosted from …" with the viewer's
 * local time). One place so the panel, list card, and share/registration
 * summaries never diverge (issue #52). Ended events drop the location.
 *
 * The compact (card) variant is deliberately quieter: the start time only, and
 * no "Next session" line — a card is for triage, the panel carries the detail.
 */
export function EventFacts({ event, variant, distance, className }: EventFactsProps) {
  const {
    display,
    recurrenceLine,
    whenLine,
    eventTimeRange,
    eventStartTime,
    whereLine,
    whereSubtext,
  } = useEventDisplay(event)

  const compact = variant === 'compact'
  const time = compact ? eventStartTime : eventTimeRange

  // The muted detail under the timing. "Started …" is only meaningful for a
  // course (a run with an end); the "Next session" line is panel-only.
  let timingDetail: string | undefined

  if (display.next && recurrenceLine) {
    if (display.status === 'started')
      timingDetail = display.kind === 'course' ? whenLine : undefined
    else if (display.status === 'running' && compact) timingDetail = undefined
    else timingDetail = whenLine
  }

  const items: SummaryItem[] = [
    recurrenceLine
      ? {
          icon: CalendarIcon,
          text: [recurrenceLine, time].filter(Boolean).join(' · '),
          subtext: timingDetail,
        }
      : {
          // One-off / terminal: the when-line leads (it IS the date or message).
          icon: CalendarIcon,
          text: [whenLine, display.next ? time : null].filter(Boolean).join(' · '),
        },
  ]

  if (whereLine && display.status !== 'ended') {
    items.push({
      icon: display.online ? MonitorIcon : LocationIcon,
      text: whereLine,
      subtext: display.online ? (whereSubtext ?? undefined) : (distance ?? undefined),
    })
  }

  return <Summary className={className} items={items} variant={variant} />
}
