import type { Story, StoryDefault } from '@ladle/react'
import type { Event } from '@/types'
import type { ReactNode } from 'react'

import { StoryWrapper, StorySection } from '../../ladle'

import { EventFacts, type EventFactsProps } from './EventFacts'

import { useEventDisplay, type DisplayableEvent } from '@/hooks/use-event-display'
import { mockEvent, mockEventOvernight } from '@/mocks/events'

export default { title: 'Molecules' } satisfies StoryDefault

// A caller resolves the strings once and hands them down, as EventListItem does.
const Facts = ({
  event,
  ...props
}: Omit<EventFactsProps, 'strings'> & { event: DisplayableEvent }) => (
  <EventFacts {...props} strings={useEventDisplay(event)} />
)

const EXAMPLES = {
  'In person': mockEvent,
  'With a room': { ...mockEvent, address: { ...mockEvent.address, room: 'Hall B' } },
  Online: { ...mockEvent, eventType: 'online' },
  'Past midnight': mockEventOvernight,
  Course: { ...mockEvent, schedule: { ...mockEvent.schedule!, endingType: 'count', count: 8 } },
  Ended: {
    ...mockEvent,
    schedule: {
      ...mockEvent.schedule!,
      recurrenceType: null,
      firstDate: new Date('2020-06-01T09:30:00Z'),
      upcomingDates: [],
    },
  },
} satisfies Record<string, Event>

type ExampleKey = keyof typeof EXAMPLES

/** One look, at the width it renders at in the app, under its name and where it appears. */
const Look = ({
  name,
  where,
  width,
  children,
}: {
  name: string
  where: string
  width: string
  children: ReactNode
}) => (
  <div className="flex flex-col gap-2">
    <div>
      <p className="text-sm font-semibold">{name}</p>
      <p className="text-xs text-gray-11">{where}</p>
    </div>
    <div className={`${width} rounded-lg border border-divider p-4`}>{children}</div>
  </div>
)

/**
 * EventFacts — a class's when and where, built by one component so every surface agrees: the
 * schedule (pattern and time, the next date faded below) and the place (the address, or a screen
 * for an online class, with the host's own clock). An ended class drops the place.
 *
 * Pick a case with the Example control; every look below renders it.
 */
export const Default: Story<{ example: ExampleKey }> = ({ example }) => {
  const event = EXAMPLES[example]

  return (
    <StoryWrapper>
      <StorySection
        description="The same class in each of the component's three looks, each at the width it gets in the app."
        title="Looks"
      >
        <div className="flex flex-wrap items-start gap-6">
          <Look name="Panel" where="A class's page in a drawer or narrow column" width="w-[336px]">
            <Facts event={event} />
          </Look>
          <Look
            name="Detailed"
            where="A class's page beside the inline map: labels, larger icons and values, and Cost"
            width="w-[560px]"
          >
            <Facts detailed event={event} />
          </Look>
          <Look name="Card" where="A row in a list of classes" width="w-[336px]">
            <Facts event={event} surface="card" />
          </Look>
        </div>
      </StorySection>

      <StorySection
        description="A list of search results passes the distance, faded under the address. The summary above the sign-up form drops every faded line (`hideSubtext`), since the form asks which date."
        title="Card options"
      >
        <div className="flex flex-wrap items-start gap-6">
          <Look name="With distance" where="Search results" width="w-[336px]">
            <Facts distance="6.2 km away" event={event} surface="card" />
          </Look>
          <Look name="Without faded lines" where="The sign-up form's summary" width="w-[336px]">
            <Facts hideSubtext distance="6.2 km away" event={event} surface="card" />
          </Look>
        </div>
      </StorySection>

      <div />
    </StoryWrapper>
  )
}

Default.storyName = 'Event Facts'
Default.args = { example: 'In person' }
Default.argTypes = {
  example: {
    name: 'Example',
    options: Object.keys(EXAMPLES),
    control: { type: 'radio' },
    defaultValue: 'In person',
  },
}
