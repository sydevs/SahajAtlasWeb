import type { Story, StoryDefault } from '@ladle/react'
import type { Event } from '@/types'

// EventDetails is intentionally not in the organisms barrel (lazy-loaded; see
// organisms/index.ts), so import it from its co-located files.
import { StoryWrapper, StorySection } from '../../ladle'

import { EventDetails } from './EventDetails'
import { EventHeader } from './EventHeader'
import { EventRegisterBar } from './EventRegister'

import { mockEvent } from '@/mocks/events'

export default { title: 'Organisms' } satisfies StoryDefault

// Full panel anatomy: header (title · chips · timing) over the body (facts →
// Register → actions → images → About), as EventView composes them.
function Panel({ event }: { event: Event }) {
  return (
    <div className="max-w-md border border-divider">
      <EventHeader event={event} />
      <EventDetails basePath={`/demo/${event.id}`} event={event} />
    </div>
  )
}

const course: Event = {
  ...mockEvent,
  id: 104,
  title: 'Beginners Meditation Course',
  schedule: {
    ...mockEvent.schedule!,
    endingType: 'count',
    count: 8,
  },
}

const startedCourse: Event = {
  ...course,
  id: 105,
  schedule: {
    ...course.schedule!,
    // First session well in the past → registration closed, "Started" chip.
    firstDate: new Date('2020-01-04T09:30:00Z'),
  },
}

const ended: Event = {
  ...mockEvent,
  id: 106,
  title: 'Summer Retreat Talk',
  schedule: {
    ...mockEvent.schedule!,
    recurrenceType: null,
    firstDate: new Date('2020-06-01T18:00:00Z'),
    upcomingDates: [],
  },
}

const inactive: Event = {
  ...mockEvent,
  id: 107,
  title: 'Dormant Venue Programme',
  inactive: true,
}

const external: Event = {
  ...mockEvent,
  id: 109,
  title: 'Regional Retreat (external booking)',
  registrationMode: 'external',
  externalRegistrationUrl: 'https://example.org/register',
}

/**
 * EventDetails — the redesigned event panel (issue #52): facts are plain text,
 * Register is the single filled CTA, secondary actions are labelled tonal
 * circles, and host prose sits below the fold under "About".
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="A recurring in-person weekly class." title="In Person">
      <Panel event={mockEvent} />
    </StorySection>

    <StorySection
      description="An online event in French — converted times, hosted-from line, no Directions."
      title="Online"
    >
      <Panel event={{ ...mockEvent, id: 108, eventType: 'online', languages: ['fr'] }} />
    </StorySection>

    <StorySection description="A bounded course before its first session." title="Course">
      <Panel event={course} />
    </StorySection>

    <StorySection
      description="A started course — registration closed, contact-to-join-late helper."
      title="Started course"
    >
      <Panel event={startedCourse} />
    </StorySection>

    <StorySection
      description="An ended one-off (direct links only) — no actions; See nearby is the way out."
      title="Ended"
    >
      <Panel event={ended} />
    </StorySection>

    <StorySection
      description="An inactive event — no Register; Contact is the emphasized action."
      title="Inactive"
    >
      <Panel event={inactive} />
    </StorySection>

    <StorySection
      description="Registration handled off-site: the CTA becomes an external link out to the host's own page rather than opening our drawer."
      title="External registration"
    >
      <Panel event={external} />
    </StorySection>

    <StorySection
      description="The Register slot on its own, as the mobile sheet's sticky footer renders it. `registerInline={false}` is what the panel passes when the bar is pinned to the footer instead."
      title="Register bar"
    >
      <div className="flex max-w-md flex-col gap-4">
        <div className="border border-divider p-3">
          <EventRegisterBar basePath="/demo/101" event={mockEvent} />
        </div>
        <div className="border border-divider">
          <EventHeader event={mockEvent} />
          <EventDetails basePath="/demo/101" event={mockEvent} registerInline={false} />
        </div>
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Event Details'
