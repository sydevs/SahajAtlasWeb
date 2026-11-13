import type { Story, StoryDefault } from '@ladle/react'
import type { EventSlim } from '@/types'

import { StorySection, StoryWrapper } from '../../ladle'

import { InactiveListingRow } from './InactiveListing'

import { EventListItem } from '@/components/molecules/EventListItem'
import { List } from '@/components/molecules/List'
import { mockEventSlim, mockEventSlimOnline } from '@/mocks/events'

export default { title: 'Molecules' } satisfies StoryDefault

// The host's own title: the card shows "Meditation in Cambridge" instead.
const inactive: EventSlim = {
  ...mockEventSlim,
  id: 151,
  title: 'Meditation at 50 Murray Pl',
  inactive: true,
  path: '/united-kingdom/cambridge/151',
}

// A listing in a language other than the visitor's keeps its language chip.
const inactiveOtherLanguage: EventSlim = {
  ...inactive,
  id: 152,
  title: 'Meditação no parque',
  languages: ['pt'],
  address: { ...inactive.address, city: 'Florianópolis' },
  path: '/brazil/florianopolis/152',
}

/**
 * InactiveListing — an inactive (by-request) listing's card in a list: "Meditation in <City>",
 * whatever title its host typed, and the class page's own "Contact host for timings" line. The
 * `inactive` flag alone makes a listing one. Its page is the ordinary class page, which shows the
 * host's description.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="The card in a place's list." title="Row">
      <div className="max-w-md">
        <List>
          <InactiveListingRow event={inactive} />
          <InactiveListingRow event={inactiveOtherLanguage} />
        </List>
      </div>
    </StorySection>

    <StorySection
      description="Among ordinary cards, in a place's list."
      inContext={true}
      title="Examples"
    >
      <div className="max-w-md overflow-hidden rounded-lg border border-divider">
        <List>
          <EventListItem event={mockEventSlim} />
          <EventListItem event={inactive} />
          <EventListItem event={mockEventSlimOnline} />
        </List>
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Inactive Listing'
