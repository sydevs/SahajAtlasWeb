import type { Story, StoryDefault } from '@ladle/react'
import type { Event } from '@/types'

import { StoryWrapper, StorySection } from '../../ladle'

import { EventActions } from './EventActions'

import { mockEvent } from '@/mocks/events'

export default { title: 'Molecules' } satisfies StoryDefault

const online: Event = { ...mockEvent, id: 201, eventType: 'online' }
const noWebsite: Event = { ...mockEvent, id: 202, website: null }
const noContact: Event = { ...mockEvent, id: 203, contactPhone: null, contactName: null }
const inactive: Event = { ...mockEvent, id: 204, inactive: true }

// The drawer panel is ~352px wide with a 24px gutter, so its content box is
// ~304px — preview at exactly that, the real case. The row must fit its full
// action set on one line there without wrapping or scrolling.
function Panel({ event }: { event: Event }) {
  return (
    <div className="w-[304px] rounded-lg border border-divider py-3">
      <EventActions basePath={`/demo/${event.id}`} event={event} />
    </div>
  )
}

/**
 * EventActions — the secondary action row under an event's Register CTA. The
 * set is chosen by the display resolver per state; Contact and Website only
 * appear when the CMS carries them, and Directions only for a physical venue.
 * Contact is a `tel:` link on touch and a number + copy popover on desktop;
 * Add to calendar opens a Google link / .ics download.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="The full set — Directions · Add to calendar · Website · Contact · Share — on one line."
      title="Physical event"
    >
      <Panel event={mockEvent} />
    </StorySection>

    <StorySection
      description="Online events drop Directions (no venue to route to)."
      title="Online"
    >
      <Panel event={online} />
    </StorySection>

    <StorySection description="An event with no website in the CMS." title="Without website">
      <Panel event={noWebsite} />
    </StorySection>

    <StorySection description="An event with no contact phone." title="Without contact">
      <Panel event={noContact} />
    </StorySection>

    <StorySection
      description="Inactive: no Register exists, so Contact is the emphasized action."
      title="Inactive"
    >
      <Panel event={inactive} />
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Event Actions'
