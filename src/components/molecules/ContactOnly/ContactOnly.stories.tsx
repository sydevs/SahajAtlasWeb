import type { Story, StoryDefault } from '@ladle/react'
import type { Event, EventSlim } from '@/types'

import { StorySection, StoryWrapper } from '../../ladle'

import { ContactOnlyDetails, ContactOnlyRow } from './ContactOnly'

import { EventListItem } from '@/components/molecules/EventListItem'
import { List } from '@/components/molecules/List'
import { mockEvent, mockEventSlim, mockEventSlimOnline } from '@/mocks/events'

export default { title: 'Molecules' } satisfies StoryDefault

const row: EventSlim = {
  ...mockEventSlim,
  id: 151,
  title: 'Tuesday Meditation',
  contactOnly: true,
  address: null,
  schedule: null,
  path: '/united-kingdom/cambridge/151',
}

const details: Event = {
  ...mockEvent,
  id: 151,
  title: 'Tuesday Meditation',
  contactOnly: true,
  address: null,
  schedule: null,
}

/**
 * ContactOnly (PROTOTYPE) — a listing with a city and a contact, and no pin, address or schedule,
 * for places where a group can't publish where it meets. `ContactOnlyRow` is its card in a list,
 * `ContactOnlyDetails` its class page. `contactOnly` is not a CMS field yet, so nothing live
 * reaches these components.
 *
 * On a touch screen the phone number is a Call button; with a mouse it is plain, selectable text.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="The card in a place's list." title="Row">
      <div className="max-w-md">
        <List>
          <ContactOnlyRow event={row} />
        </List>
      </div>
    </StorySection>

    <StorySection description="The class page body, in place of time and address." title="Details">
      <StorySection title="Minimal" variant="subsection">
        <div className="max-w-md">
          <ContactOnlyDetails event={{ ...details, contactName: null, contactPhone: null }} />
        </div>
      </StorySection>
      <StorySection title="Maximal" variant="subsection">
        <div className="max-w-md">
          <ContactOnlyDetails event={details} />
        </div>
      </StorySection>
    </StorySection>

    <StorySection
      description="Among ordinary cards, in a place's list."
      inContext={true}
      title="Examples"
    >
      <div className="max-w-md overflow-hidden rounded-lg border border-divider">
        <List>
          <EventListItem event={mockEventSlim} />
          <EventListItem event={row} />
          <EventListItem event={mockEventSlimOnline} />
        </List>
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Contact Only'
