import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { Event } from '@/types'

import { Thrower, ViewHarness } from '@/views/story-harness'
import { EventView } from '@/views/EventView/EventView'
import { useLocale } from '@/hooks/use-locale'
import { mockNotFound } from '@/mocks/errors'
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

type ExampleKey = keyof typeof EXAMPLES

// The failure this view actually reaches (issue #89): a link to an event the CMS no
// longer serves — SahajCloud answers 404 and `classifyError` reads the status. It is a
// dead end, not a malfunction, so the drawer renders the empty-state register: a neutral
// note naming what was missing plus somewhere real to go. The two cases differ only in
// what the URL can offer — which is the whole point of the recovery ladder.
const DEAD_LINKS = {
  // An ancestor the region tree still knows: the ladder's first rung.
  'Not found · in a region': '/gb/cambridgeshire/999999',
  // A flat legacy link with no ancestry at all — falls through to the floor rung.
  'Not found · no ancestor': '/999999',
} as const

type DeadLink = keyof typeof DEAD_LINKS

/**
 * EventView — the full event panel screen (header + facts → Register → actions →
 * images → About). Switch resolver states with the control; the last two cases are dead
 * links, rendered by DrawerErrorFallback.
 *
 * Compare the two: the first offers "See events in Cambridgeshire", the second only
 * "Browse all countries". Both say "that event" (not "that page"), both keep a working
 * close control, and neither shows a retry — a dead link fails identically every time.
 */
export const Default: Story<{ example: ExampleKey | DeadLink }> = ({ example }) => {
  const { locale } = useLocale()
  const event = EXAMPLES[example] ?? mockEvent
  const deadLink = DEAD_LINKS[example as DeadLink]

  return (
    <ViewHarness
      path={deadLink}
      seed={(client: QueryClient) => client.setQueryData<Event>(['event', event.id, locale], event)}
      seedKey={example}
    >
      {deadLink ? (
        <Thrower error={mockNotFound.event} />
      ) : (
        <EventView basePath={event.path} id={event.id} />
      )}
    </ViewHarness>
  )
}

Default.storyName = 'Event'
Default.meta = { width: 'xsmall' }
Default.args = { example: 'In person' }
Default.argTypes = {
  example: {
    name: 'Example',
    options: [...Object.keys(EXAMPLES), ...Object.keys(DEAD_LINKS)],
    control: { type: 'radio' },
    defaultValue: 'In person',
  },
}
