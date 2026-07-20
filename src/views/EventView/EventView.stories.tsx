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
  mockEventToday,
} from '@/mocks/events'

export default { title: 'Views' } satisfies StoryDefault

// EventView keys on `['event', id, locale]`. Each case is one resolver state,
// reusing the shared event fixtures.
const CASES: Record<string, Event> = {
  'In person': mockEvent,
  Online: { ...mockEvent, id: 301, eventType: 'online', languages: ['fr'] },
  Today: mockEventToday,
  Course: mockEventCourse,
  Ended: mockEventEnded,
  Inactive: mockEventInactive,
  External: {
    ...mockEvent,
    id: 302,
    registrationMode: 'external',
    externalRegistrationUrl: 'https://example.org/register',
  },
}

type CaseKey = keyof typeof CASES

/**
 * EventView — the full event panel screen (header + facts → Register → actions →
 * images → About). Switch resolver states with the "case" control.
 */
export const Default: Story<{ case: CaseKey }> = ({ case: key }) => {
  const { locale } = useLocale()
  const event = CASES[key]

  return (
    <ViewHarness
      seed={(client: QueryClient) => client.setQueryData<Event>(['event', event.id, locale], event)}
      seedKey={key}
    >
      <EventView basePath={event.path} id={event.id} />
    </ViewHarness>
  )
}

Default.storyName = 'Event View'
Default.args = { case: 'In person' }
Default.argTypes = {
  case: { options: Object.keys(CASES), control: { type: 'select' }, defaultValue: 'In person' },
}
