import type { Story, StoryDefault } from '@ladle/react'
import type { Event } from '@/types'

import { StoryWrapper, StorySection } from '../../ladle'

import { EventFacts } from './EventFacts'

import { mockEvent } from '@/mocks/events'

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
 * EventFacts — the shared calendar/location fact block: the repeat pattern +
 * time on the first line, the next date muted below, then the address (a screen
 * icon for online events). Ended events drop the location line entirely.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="A recurring in-person class." title="In person">
      <div className="max-w-md">
        <EventFacts event={mockEvent} />
      </div>
    </StorySection>

    <StorySection description="An online class — screen icon, converted time." title="Online">
      <div className="max-w-md">
        <EventFacts event={{ ...mockEvent, eventType: 'online' }} />
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
      description="The boxed details card (a title over the default facts on a tinted surface) shown above the registration and share forms."
      title="Card"
    >
      <div className="flex max-w-md flex-col gap-4">
        <EventFacts event={mockEvent} title={mockEvent.title} variant="card" />
        <EventFacts
          event={{ ...mockEvent, eventType: 'online' }}
          title="Online Evening Sitting"
          variant="card"
        />
      </div>
    </StorySection>

    <StorySection
      description="The variant every result card uses: smaller icons faded to the subtext level, the end time dropped, and no 'Next session' line — a list repeats the pattern, so only the lead time earns its space."
      title="Compact"
    >
      <div className="flex max-w-md flex-col gap-4">
        <EventFacts event={mockEvent} variant="compact" />
        <EventFacts event={{ ...mockEvent, eventType: 'online' }} variant="compact" />
        <EventFacts event={course} variant="compact" />
      </div>
    </StorySection>

    <StorySection
      description="Search results pass a distance node, rendered as the address subtext."
      title="With distance"
    >
      <div className="max-w-md">
        <EventFacts distance="6.2 km away" event={mockEvent} variant="compact" />
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Event Facts'
