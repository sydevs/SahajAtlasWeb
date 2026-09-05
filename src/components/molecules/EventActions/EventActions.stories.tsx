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

// The drawer panel is about 352px wide, with a 24px gutter. So its content
// box is about 304px. This previews at exactly that width, the real case.
// The row must fit its full action set on one line there, without wrapping
// or scrolling.
function Panel({ event }: { event: Event }) {
  return (
    <div className="w-[304px] rounded-lg border border-divider py-3">
      <EventActions basePath={`/demo/${event.id}`} event={event} />
    </div>
  )
}

/**
 * EventActions — the secondary action row under an event's Register CTA. The
 * display resolver chooses the set per state. Contact and Website appear only
 * when the CMS carries them. Directions appears only for a physical venue.
 * Contact is a `tel:` link on touch, and a number-and-copy popover on
 * desktop.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="The full set — Directions · Website · Contact · Share — on one line."
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
