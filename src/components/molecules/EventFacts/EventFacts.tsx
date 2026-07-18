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
 * time, with the next date muted below) and a location line (a screen icon for
 * online, else the address). One place so the panel, list card, and the
 * share/registration summaries never diverge (issue #52). Ended events drop the
 * location — there's no live venue left to point at. Facts are plain text: the
 * address is never a control (the map is already framed on the open event).
 */
export function EventFacts({ event, variant, className }: EventFactsProps) {
  const { display, timingTitle, timingDetail, whereLine } = useEventDisplay(event)
  // Icons match the text height in the compact card; roomier in the panel.
  const iconSize = variant === 'compact' ? 16 : 20

  const items: SummaryItem[] = [
    {
      icon: <CalendarIcon size={iconSize} />,
      text: (
        <>
          <div>{timingTitle}</div>
          {timingDetail && <div className="font-normal text-gray-11">{timingDetail}</div>}
        </>
      ),
    },
  ]

  if (whereLine && display.status !== 'ended') {
    items.push({
      icon: display.online ? <MonitorIcon size={iconSize} /> : <LocationIcon size={iconSize} />,
      text: whereLine,
    })
  }

  return <Summary className={className} items={items} variant={variant} />
}
