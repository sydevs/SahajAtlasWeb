import { Summary, type SummaryItem } from '@/components/molecules/Summary'
import { CalendarIcon, LocationIcon, MonitorIcon } from '@/components/atoms/Icons'
import { useEventDisplay, type DisplayableEvent } from '@/hooks/use-event-display'

export type EventFactsProps = {
  event: DisplayableEvent
  /**
   * Panel-only: tapping the address re-frames the map (never navigates). When
   * omitted the address renders as plain text — facts are never actions.
   */
  onAddressClick?: () => void
  className?: string
}

/**
 * The shared event when/where fact block: a calendar line (the repeat pattern +
 * time, with the next date muted below) and a location line (a screen icon for
 * online, else the address). One place so the panel, list card, and the
 * share/registration summaries never diverge (issue #52). Ended events drop the
 * location — there's no live venue left to point at.
 */
export function EventFacts({ event, onAddressClick, className }: EventFactsProps) {
  const { display, timingTitle, timingDetail, whereLine } = useEventDisplay(event)

  const items: SummaryItem[] = [
    {
      icon: <CalendarIcon size={20} />,
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
      icon: display.online ? <MonitorIcon size={20} /> : <LocationIcon size={20} />,
      text:
        !display.online && onAddressClick ? (
          <button
            className="text-start font-medium text-foreground"
            type="button"
            onClick={onAddressClick}
          >
            {whereLine}
          </button>
        ) : (
          whereLine
        ),
    })
  }

  return <Summary className={className} items={items} />
}
