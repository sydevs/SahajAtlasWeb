import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { EventCard } from './EventCard'

import { List } from '@/components/molecules/List'
import { mockEventSlim, mockEventSlimOnline } from '@/mocks/events'

export default { title: 'Molecules / List' } satisfies StoryDefault

/**
 * EventCard — the three-line list row (issue #52): bold differentiator + status
 * chip, then type · recurrence · time, then the address with the distance
 * right-aligned. `variant` picks the bold slot: `title` for mixed search/online
 * lists, `place` for region-grouped lists (the group header states the region,
 * so the venue/street differentiates).
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="Mixed-list variant — the title is the bold slot."
      title="Search list"
    >
      <div className="max-w-md">
        <EventCard event={mockEventSlim} />
      </div>
    </StorySection>

    <StorySection
      description="Region-grouped variant — the venue/street is the bold slot."
      title="Region list"
    >
      <div className="max-w-md">
        <EventCard event={mockEventSlim} variant="place" />
      </div>
    </StorySection>

    <StorySection
      description="Online — hosted-from line, converted time, no distance."
      title="Online"
    >
      <div className="max-w-md">
        <EventCard event={mockEventSlimOnline} />
      </div>
    </StorySection>

    <StorySection
      description="Distances align right so a result list scans as a column."
      title="Distances"
    >
      <div className="max-w-md rounded-lg border border-divider overflow-hidden">
        <List>
          <EventCard event={{ ...mockEventSlim, distance: 0.4 }} />
          <EventCard event={{ ...mockEventSlim, id: 111, distance: 3.6 }} />
          <EventCard event={{ ...mockEventSlim, id: 112, distance: 128 }} />
        </List>
      </div>
    </StorySection>

    <StorySection
      description="A dateless event carries its contact-the-host line instead of a time."
      title="Dateless"
    >
      <div className="max-w-md">
        <EventCard event={{ ...mockEventSlim, id: 113, schedule: null }} />
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Event Card'
