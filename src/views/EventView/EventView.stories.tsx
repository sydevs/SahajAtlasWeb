import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { Event } from '@/types'

import { ViewHarness } from '@/views/story-harness'
import { EventView } from '@/views/EventView/EventView'
import { useLocale } from '@/hooks/use-locale'
import { mockErrors } from '@/mocks/errors'
import {
  mockEvent,
  mockEventCourse,
  mockEventEnded,
  mockEventFull,
  mockEventFullToday,
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
  // At capacity: "Full" chip, no Register button — the facts stay normal (the
  // class still runs), and the slot becomes "This event is full" + "See nearby
  // events" + the contact helper.
  Full: mockEventFull,
  // Full AND meeting today — "Full" supersedes the "Today" chip.
  'Full · today': mockEventFullToday,
  'External registration': {
    ...mockEvent,
    id: 302,
    registrationMode: 'external',
    externalRegistrationUrl: 'https://example.org/register',
  },
}

type ExampleKey = keyof typeof EXAMPLES | typeof NOT_FOUND

// The failure this view actually reaches (issue #89): a link to an event the CMS no
// longer serves, or a hand-typed path that isn't an event at all — both throw
// "Region not found:" / "Not an event:", classify as `not-found`, and so offer only the
// way back into live inventory. No retry: the link is dead, not flaky.
const NOT_FOUND = 'Not found' as const

/**
 * EventView — the full event panel screen (header + facts → Register → actions →
 * images → About). Switch resolver states with the control; the last case is the dead
 * link, rendered by DrawerErrorFallback.
 */
export const Default: Story<{ example: ExampleKey }> = ({ example }) => {
  const { locale } = useLocale()
  const event = example === NOT_FOUND ? EXAMPLES['In person'] : EXAMPLES[example]

  return (
    <ViewHarness
      seed={(client: QueryClient) => client.setQueryData<Event>(['event', event.id, locale], event)}
      seedKey={example}
      throws={example === NOT_FOUND ? mockErrors['not-found'] : undefined}
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
    options: [...Object.keys(EXAMPLES), NOT_FOUND],
    control: { type: 'radio' },
    defaultValue: 'In person',
  },
}
