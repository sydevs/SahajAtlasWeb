import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { Event } from '@/types'

import { ViewHarness } from '@/views/story-harness'
import { EventView } from '@/views/EventView/EventView'
import { useLocale } from '@/hooks/use-locale'
import {
  mockEvent,
  mockEventCourse,
  mockEventEnded,
  mockEventInactive,
  mockEventMinimal,
  mockEventToday,
} from '@/mocks/events'

export default { title: 'Views' } satisfies StoryDefault

// EventView keys on `['event', id, locale]`. Each example is one resolver state,
// reusing the shared event fixtures.
const EXAMPLES: Record<string, Event> = {
  'In person': mockEvent,
  Minimal: mockEventMinimal,
  Online: { ...mockEvent, id: 301, eventType: 'online', languages: ['fr'] },
  Today: mockEventToday,
  Course: mockEventCourse,
  Ended: mockEventEnded,
  Inactive: mockEventInactive,
  'External registration': {
    ...mockEvent,
    id: 302,
    registrationMode: 'external',
    externalRegistrationUrl: 'https://example.org/register',
  },
}

type ExampleKey = keyof typeof EXAMPLES

/**
 * EventView — the full event panel screen (header + facts → Register → actions →
 * images → About). Switch resolver states with the control.
 */
export const Default: Story<{ example: ExampleKey }> = ({ example }) => {
  const { locale } = useLocale()
  const event = EXAMPLES[example]

  return (
    <ViewHarness
      seed={(client: QueryClient) => client.setQueryData<Event>(['event', event.id, locale], event)}
      seedKey={example}
    >
      <EventView basePath={event.path} id={event.id} />
    </ViewHarness>
  )
}

Default.storyName = 'Event'
Default.meta = { width: 'xsmall' }
Default.args = { example: 'In person' }
Default.argTypes = {
  example: {
    name: 'Example',
    options: Object.keys(EXAMPLES),
    control: { type: 'radio' },
    defaultValue: 'In person',
  },
}
