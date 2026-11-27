import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { StoryFallbackArg } from '@/views/story-harness'
import type { Event } from '@/types'

import { NO_ERROR, ViewStory, stateControl } from '@/views/story-harness'
import { EventView } from '@/views/EventView/EventView'
import { useLocale } from '@/hooks/use-locale'
import { WidgetWidthContext } from '@/config/responsive'
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
  // At capacity: no Register button — the facts stay normal (the
  // class still runs), and the slot becomes "This class is full" + "See nearby
  // events" + the contact helper.
  Full: mockEventFull,
  // Full AND meeting today: no chip, and the when line says "Today".
  'Full · today': mockEventFullToday,
  'External registration': {
    ...mockEvent,
    id: 302,
    registrationMode: 'external',
    externalRegistrationUrl: 'https://example.org/register',
  },
}

type ExampleKey = keyof typeof EXAMPLES

// `Phone sheet` is the map-mode, narrow-widget case: Register pins to the sheet's foot and the
// action row stays in the panel. The map itself is left out, since the footer is what is previewed.
const LAYOUTS = ['Panel', 'Phone sheet'] as const

type LayoutKey = (typeof LAYOUTS)[number]

/**
 * EventView — the full event panel screen: header, facts, actions, Register, images, About.
 * Switch resolver states with the Example control, and the phone map sheet's pinned Register
 * with Layout. The State control instead runs any of them
 * into the drawer's fallback.
 *
 * "Not found · event" is the failure this view actually reaches. A link to an event the CMS no
 * longer serves gets a 404 from SahajCloud, and `classifyError` reads that status. It is a dead
 * end, not a malfunction, so it renders the empty-state register: a neutral note saying "that
 * event", not "that page", a working close control, somewhere real to go, and no retry — a dead
 * link fails identically every time.
 *
 * Each example renders at its own event path (`/united-kingdom/cambridge/<id>`), so the ladder
 * drops the dead id and offers **Cambridge**, the nearest ancestor the region tree still knows,
 * with nothing configured per error.
 */
export const Default: Story<{
  example: ExampleKey
  layout: LayoutKey
  state: StoryFallbackArg
}> = ({ example, layout, state }) => {
  const { locale } = useLocale()
  const event = EXAMPLES[example] ?? mockEvent
  const sheet = layout === 'Phone sheet'

  return (
    <WidgetWidthContext.Provider value={sheet ? false : null}>
      <ViewStory
        example={`${example}·${layout}`}
        mode={sheet ? { hasMap: true } : undefined}
        path={event.path}
        seed={(client: QueryClient) =>
          client.setQueryData<Event>(['event', event.id, locale], event)
        }
        state={state}
      >
        <EventView basePath={event.path} id={event.id} />
      </ViewStory>
    </WidgetWidthContext.Provider>
  )
}

Default.storyName = 'Event'
Default.meta = { width: 'xsmall' }
Default.args = { example: 'In person', layout: 'Panel', state: NO_ERROR }
Default.argTypes = {
  example: {
    name: 'Example',
    options: Object.keys(EXAMPLES),
    control: { type: 'radio' },
    defaultValue: 'In person',
  },
  // Keyed `layout` so Ladle's alphabetical order keeps it between Example and State.
  layout: {
    name: 'Layout',
    options: [...LAYOUTS],
    control: { type: 'radio' },
    defaultValue: 'Panel',
  },
  state: stateControl('Not found · event'),
}
