import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { EventListItem } from './EventListItem'

import { List } from '@/components/molecules/List'
import { mockEventSlim, mockEventSlimOnline } from '@/mocks/events'

export default { title: 'Molecules / List' } satisfies StoryDefault

/**
 * EventListItem — the list card (issue #52): title, then recurrence · start time,
 * then the address with the distance right-aligned, then a chip row (language ·
 * status) at the bottom. Online events carry "Online" in the distance slot and
 * a hosted-from place line.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="A weekly class with a long title." title="Weekly class">
      <div className="max-w-md">
        <EventListItem event={mockEventSlim} />
      </div>
    </StorySection>

    <StorySection
      description="A course — no type label on the card; the status chip sits at the bottom."
      title="Course"
    >
      <div className="max-w-md">
        <EventListItem
          event={{
            ...mockEventSlim,
            id: 110,
            title: 'Beginners Meditation Course',
            schedule: { ...mockEventSlim.schedule!, endingType: 'count', count: 8 },
          }}
        />
      </div>
    </StorySection>

    <StorySection
      description="Online — hosted-from place line; 'Online' sits in the distance slot."
      title="Online"
    >
      <div className="max-w-md">
        <EventListItem event={mockEventSlimOnline} />
      </div>
    </StorySection>

    <StorySection
      description="Distance reads as a faded subtext under the address. Anything under 5km is suppressed — at that range 'nearby' is more honest than a number — so the first card shows none."
      title="Distances"
    >
      <div className="max-w-md overflow-hidden rounded-lg border border-divider">
        <List>
          <EventListItem event={{ ...mockEventSlim, distance: 3.6 }} />
          <EventListItem event={{ ...mockEventSlim, id: 111, distance: 6 }} />
          <EventListItem event={{ ...mockEventSlim, id: 112, distance: 128 }} />
        </List>
      </div>
    </StorySection>

    <StorySection
      description="A dateless event carries its contact-the-host line instead of a time."
      title="Dateless"
    >
      <div className="max-w-md">
        <EventListItem event={{ ...mockEventSlim, id: 113, schedule: null }} />
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Event List Item'
