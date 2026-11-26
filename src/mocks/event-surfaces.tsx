import type { EventChipsProps } from '@/components/molecules/EventChips'
import type { EventFactsProps } from '@/components/molecules/EventFacts'

import { EventChips } from '@/components/molecules/EventChips/EventChips'
import { EventFacts } from '@/components/molecules/EventFacts/EventFacts'
import { useEventDisplay, type DisplayableEvent } from '@/hooks/use-event-display'

// A parent resolves an event's strings once and hands them down (#505). Stories and specs render
// a sample event the same way through these.

export const FactsFor = ({
  event,
  ...props
}: Omit<EventFactsProps, 'strings'> & { event: DisplayableEvent }) => (
  <EventFacts {...props} strings={useEventDisplay(event)} />
)

export const ChipsFor = ({
  event,
  ...props
}: Omit<EventChipsProps, 'strings' | 'languages'> & {
  event: DisplayableEvent & { languages: string[] }
}) => <EventChips {...props} languages={event.languages} strings={useEventDisplay(event)} />
