import type { Story, StoryDefault } from '@ladle/react'

// EventDetails is intentionally not in the organisms barrel (lazy-loaded; see
// organisms/index.ts), so import it from its co-located file.
import { StoryWrapper, StorySection } from '../../ladle'

import { EventDetails } from './EventDetails'

import { mockEvent } from '@/mocks/events'

export default { title: 'Organisms' } satisfies StoryDefault

/**
 * EventDetails — the reusable event content body (images, description,
 * timing/location/contact cards, register/share CTAs). It has no chrome of its
 * own — the app renders it inside the EventView drawer — so it's shown here
 * unadorned, only width-limited, for an in-person event, an online event, and one
 * with no images. `basePath` is where the register/share drawers would open.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="A recurring in-person event." title="In Person">
      <div className="max-w-md">
        <EventDetails basePath="/demo/507" event={mockEvent} />
      </div>
    </StorySection>

    <StorySection description="An online event in French." title="Online">
      <div className="max-w-md">
        <EventDetails
          basePath="/demo/508"
          event={{ ...mockEvent, eventType: 'online', languages: ['fr'] }}
        />
      </div>
    </StorySection>

    <StorySection description="An event without images." title="No Images">
      <div className="max-w-md">
        <EventDetails basePath="/demo/509" event={{ ...mockEvent, images: [] }} />
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Event Details'
