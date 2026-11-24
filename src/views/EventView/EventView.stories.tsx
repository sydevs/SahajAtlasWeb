import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { StoryFallbackArg } from '@/views/story-harness'
import type { Event } from '@/types'

import { NO_ERROR, ViewStory, stateControl } from '@/views/story-harness'
import { EventView } from '@/views/EventView/EventView'
import { useLocale } from '@/hooks/use-locale'
import { eventViewExamples, mockEvent } from '@/mocks/events'

export default { title: 'Views' } satisfies StoryDefault

// EventView keys on `['event', id, locale]`. Each example is one resolver state,
// reusing the shared event fixtures.
type ExampleKey = keyof typeof eventViewExamples

/**
 * EventView — the full event panel screen: header, facts, Register, actions, images, About.
 * Switch resolver states with the Example control. The State control instead runs any of them
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
export const Default: Story<{ example: ExampleKey; state: StoryFallbackArg }> = ({
  example,
  state,
}) => {
  const { locale } = useLocale()
  const event = eventViewExamples[example] ?? mockEvent

  return (
    <ViewStory
      example={example}
      path={event.path}
      seed={(client: QueryClient) => client.setQueryData<Event>(['event', event.id, locale], event)}
      state={state}
    >
      <EventView basePath={event.path} id={event.id} />
    </ViewStory>
  )
}

Default.storyName = 'Event'
Default.meta = { width: 'xsmall' }
Default.args = { example: 'In person', state: NO_ERROR }
Default.argTypes = {
  example: {
    name: 'Example',
    options: Object.keys(eventViewExamples),
    control: { type: 'radio' },
    defaultValue: 'In person',
  },
  state: stateControl('Not found · event'),
}
