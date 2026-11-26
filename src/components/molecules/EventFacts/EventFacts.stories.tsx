import type { Story, StoryDefault } from '@ladle/react'
import type { Event } from '@/types'

import { StoryWrapper, StorySection } from '../../ladle'

import { EventFacts as RenderFacts, type EventFactsProps } from './EventFacts'

import { useEventDisplay, type DisplayableEvent } from '@/hooks/use-event-display'
import { mockEvent, mockEventOvernight } from '@/mocks/events'

// A parent resolves an event's strings once and hands them down; each sample here does the same.
const EventFacts = ({
  event,
  ...props
}: Omit<EventFactsProps, 'strings'> & { event: DisplayableEvent }) => (
  <RenderFacts {...props} strings={useEventDisplay(event)} />
)

export default { title: 'Molecules' } satisfies StoryDefault

const course: Event = {
  ...mockEvent,
  schedule: { ...mockEvent.schedule!, endingType: 'count', count: 8 },
}

const ended: Event = {
  ...mockEvent,
  schedule: {
    ...mockEvent.schedule!,
    recurrenceType: null,
    firstDate: new Date('2020-06-01T09:30:00Z'),
    upcomingDates: [],
  },
}

/**
 * EventFacts — the shared calendar/location fact block. The repeat pattern
 * and time sit on the first line. The next date sits muted below. Then the
 * address follows, with a screen icon for online events. Ended events drop
 * the location line entirely.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="A recurring in-person class. The address ends with its postcode, and a tap copies it."
      title="In person"
    >
      <div className="max-w-md">
        <EventFacts event={mockEvent} />
      </div>
    </StorySection>

    <StorySection
      description="A venue that names the room — it reads above the street, on the panel only."
      title="With a room"
    >
      <div className="max-w-md">
        <EventFacts event={{ ...mockEvent, address: { ...mockEvent.address, room: 'Hall B' } }} />
      </div>
    </StorySection>

    <StorySection description="An online class — screen icon, converted time." title="Online">
      <div className="max-w-md">
        <EventFacts event={{ ...mockEvent, eventType: 'online' }} />
      </div>
    </StorySection>

    <StorySection
      description="A class that runs past midnight — the line stays a time range, with no dates."
      title="Past midnight"
    >
      <div className="max-w-md">
        <EventFacts event={mockEventOvernight} />
      </div>
    </StorySection>

    <StorySection description="A bounded course." title="Course">
      <div className="max-w-md">
        <EventFacts event={course} />
      </div>
    </StorySection>

    <StorySection description="An ended event — no location line." title="Ended">
      <div className="max-w-md">
        <EventFacts event={ended} />
      </div>
    </StorySection>

    <StorySection
      description="The summary: a title over the page facts on a tinted box, shown above the registration and share forms."
      title="Summary"
    >
      <div className="flex max-w-md flex-col gap-4">
        <EventFacts event={mockEvent} surface="summary" title={mockEvent.title} />
        <EventFacts
          event={{ ...mockEvent, eventType: 'online' }}
          surface="summary"
          title="Online Evening Sitting"
        />
      </div>
    </StorySection>

    <StorySection
      description="What every result card shows: smaller icons faded to the subtext level, the end time dropped, and no 'Next session' line — a list repeats the pattern, so only the lead time earns its space."
      title="Card"
    >
      <div className="flex max-w-md flex-col gap-4">
        <EventFacts event={mockEvent} surface="card" />
        <EventFacts event={{ ...mockEvent, eventType: 'online' }} surface="card" />
        <EventFacts event={course} surface="card" />
      </div>
    </StorySection>

    <StorySection
      description="Search results pass a distance node, rendered as the address subtext."
      title="With distance"
    >
      <div className="max-w-md">
        <EventFacts distance="6.2 km away" event={mockEvent} surface="card" />
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Event Facts'
