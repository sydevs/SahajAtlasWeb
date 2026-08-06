import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { StoryErrorArg } from '@/views/story-harness'
import type { Event } from '@/types'

import { NO_ERROR, ViewStory, errorControl } from '@/views/story-harness'
import { RegistrationView } from '@/views/RegistrationView/RegistrationView'
import { useLocale } from '@/hooks/use-locale'
import { mockEvent, mockEventFull } from '@/mocks/events'

export default { title: 'Views' } satisfies StoryDefault

// RegistrationView resolves its event from the path (`useEventFromPath` →
// `['event', id, locale]`), so each example seeds that key for the path's terminal id.
// `Confirmation` starts the native form on its post-submit thank-you screen.
const EXAMPLES: Record<string, { event: Event; initialSubmitted?: boolean }> = {
  'Native form': { event: mockEvent },
  Confirmation: { event: { ...mockEvent, id: 313 }, initialSubmitted: true },
  // The route is deep-linkable, so a full event must render its state message
  // here rather than an operative form (the CMS refuses it server-side too).
  Full: { event: mockEventFull },
  'External registration': {
    event: {
      ...mockEvent,
      id: 312,
      registrationMode: 'external',
      externalRegistrationUrl: 'https://example.org/register',
    },
  },
}

type ExampleKey = keyof typeof EXAMPLES

// The region the mock events sit under. Each example's event path is rebuilt from it plus
// that example's OWN id — the fixtures are spreads of `mockEvent`, so they all carry its
// path, and reusing it directly would resolve every case to event 101.
const EVENT_PARENT = mockEvent.path.slice(0, mockEvent.path.lastIndexOf('/'))

/**
 * RegistrationView — the registration drawer screen: the event summary card over
 * the form (or the link-out CTA for an externally-registered event), plus the
 * post-submit confirmation.
 *
 * Two ways this route dies, and both are on the Error control (issue #89):
 *
 *  - **Not found · event** — a real registration path over an event the CMS no longer
 *    serves. The load-bearing one: `parentOf` would answer it with the event path that
 *    just 404'd, making the recovery from a dead link the same dead link. The ladder drops
 *    the failing entry and walks on, so it offers **Cambridge** instead.
 *  - **Not found · not an event** — a hand-typed `/register` whose parent is a region.
 *    `useEventFromPath` throws before any request; same body, same rung.
 */
export const Default: Story<{ example: ExampleKey; error: StoryErrorArg }> = ({
  example,
  error,
}) => {
  const { locale } = useLocale()
  const { event, initialSubmitted } = EXAMPLES[example] ?? EXAMPLES['Native form']
  const eventPath = `${EVENT_PARENT}/${event.id}`

  return (
    <ViewStory
      error={error}
      example={example}
      path={`${eventPath}/register`}
      seed={(client: QueryClient) => client.setQueryData<Event>(['event', event.id, locale], event)}
    >
      <RegistrationView
        eventPath={eventPath}
        initialSubmitted={initialSubmitted}
        parentPath={EVENT_PARENT}
      />
    </ViewStory>
  )
}

Default.storyName = 'Registration'
Default.meta = { width: 'xsmall' }
Default.args = { example: 'Native form', error: NO_ERROR }
Default.argTypes = {
  example: {
    name: 'Example',
    options: Object.keys(EXAMPLES),
    control: { type: 'radio' },
    defaultValue: 'Native form',
  },
  error: errorControl('Not found · event', 'Not found · not an event'),
}
