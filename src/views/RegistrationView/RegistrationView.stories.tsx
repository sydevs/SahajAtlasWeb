import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { StoryFallbackArg } from '@/views/story-harness'
import type { Event } from '@/types'

import { NO_ERROR, ViewStory, stateControl } from '@/views/story-harness'
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
  // The route is deep-linkable, so a full event must render its state message here rather
  // than an operative form (the CMS refuses it server-side too). It goes through the shared
  // `FallbackPanel`, whose next step is a PERSON: this one carries `contactPhone`, so it
  // leads with the organiser's number.
  Full: { event: mockEventFull },
  // The same state with nobody to call — the branch that proves the fallback: with no
  // contact on the event, `visibleActions` swaps the number for the recovery ladder, so a
  // viewer who can't join THIS class is still pointed at another one nearby.
  'Full · no contact': { event: { ...mockEventFull, id: 314, contactPhone: null } },
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
 * **Not found · event** is the dead link this route can produce: a registration path over
 * an event the CMS no longer serves. It is the load-bearing recovery case — `parentOf`
 * would answer it with the event path that just 404'd, making the recovery from a dead
 * link the same dead link, so the ladder drops the failing entry and walks on to offer
 * **Cambridge** instead.
 *
 * There is deliberately no second dead-link option. This route dies two ways — that 404,
 * and `useEventFromPath` throwing on a hand-typed `/register` whose parent is a region
 * rather than an event — but they reach the boundary as the same kind, at the same path,
 * and render the same screen. The story had both, and a reviewer flipping between them saw
 * nothing change. What actually differs is which branch of `classifyError` runs (our own
 * tag vs. an HTTP status), and `report.test.ts` covers both directly.
 */
export const Default: Story<{ example: ExampleKey; state: StoryFallbackArg }> = ({
  example,
  state,
}) => {
  const { locale } = useLocale()
  const { event, initialSubmitted } = EXAMPLES[example] ?? EXAMPLES['Native form']
  const eventPath = `${EVENT_PARENT}/${event.id}`

  return (
    <ViewStory
      example={example}
      path={`${eventPath}/register`}
      seed={(client: QueryClient) => client.setQueryData<Event>(['event', event.id, locale], event)}
      state={state}
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
Default.args = { example: 'Native form', state: NO_ERROR }
Default.argTypes = {
  example: {
    name: 'Example',
    options: Object.keys(EXAMPLES),
    control: { type: 'radio' },
    defaultValue: 'Native form',
  },
  state: stateControl('Not found · event'),
}
