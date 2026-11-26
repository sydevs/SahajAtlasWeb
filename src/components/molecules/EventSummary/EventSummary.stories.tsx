import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { EventSummary, type EventSummaryProps } from './EventSummary'

import { useEventDisplay } from '@/hooks/use-event-display'
import { mockEvent, mockEventCourse, mockEventSlimOnline, mockEventToday } from '@/mocks/events'

export default { title: 'Molecules' } satisfies StoryDefault

// The parent resolves the display once and hands it down; this stands in for that parent.
const Summary = ({ event, ...props }: Omit<EventSummaryProps, 'strings'>) => (
  <EventSummary {...props} event={event} strings={useEventDisplay(event)} />
)

/**
 * EventSummary — a class at a glance: the title with its Online tag, when and where, and the
 * triage chips. The list card renders it inside its link; the Share, Register and confirmation
 * panels render it boxed at their top, so a class reads the same wherever it is acted on.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="As a list row's body, with the distance from the searched place under the address. The title clamps to two lines, so rows stay even."
      title="In a list"
    >
      <div className="flex max-w-md flex-col gap-4">
        <Summary distance="3.6 km from Cambridge" event={mockEvent} />
        <Summary event={mockEventSlimOnline} />
      </div>
    </StorySection>

    <StorySection
      description="Boxed, as the Share panel opens. The whole title shows: it is the one class on screen."
      title="Boxed"
    >
      <div className="flex max-w-md flex-col gap-4">
        <Summary boxed event={mockEventToday} />
        <Summary boxed event={mockEventCourse} />
      </div>
    </StorySection>

    <StorySection
      description="Boxed without the faded second lines, as the registration form and its confirmation show it: the form asks which date, and the confirmation names the one chosen."
      title="Boxed · no subtext"
    >
      <div className="flex max-w-md flex-col gap-4">
        <Summary boxed hideSubtext event={mockEventToday} />
        <Summary boxed hideSubtext event={mockEventSlimOnline} />
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Event Summary'
