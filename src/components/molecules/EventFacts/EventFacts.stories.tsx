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

    <div />
  </StoryWrapper>
)

Default.storyName = 'Event Facts'
