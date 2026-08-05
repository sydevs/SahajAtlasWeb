import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { Event } from '@/types'

import { Thrower, ViewHarness } from '@/views/story-harness'
import { RegistrationView } from '@/views/RegistrationView/RegistrationView'
import { useLocale } from '@/hooks/use-locale'
import { mockEvent, mockEventFull } from '@/mocks/events'
import { mockNotFound } from '@/mocks/errors'

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

// Two ways this route dies, and the second is the load-bearing one (issue #89).
//
// `parentOf` would answer the dead-event case with `/gb/cambridgeshire/999999` — the very
// link that just 404'd — so the recovery from a dead link would be the same dead link.
// The ladder drops the failing entry and walks on, which is why both cases must offer
// Cambridgeshire.
const DEAD_LINKS = {
  // A hand-typed `/register` whose parent is a region, not an event.
  'Not found · not an event': '/gb/cambridgeshire/register',
  // A real registration path over an event the CMS no longer serves.
  'Not found · dead event': '/gb/cambridgeshire/999999/register',
} as const

type DeadLink = keyof typeof DEAD_LINKS

/**
 * RegistrationView — the registration drawer screen: the event summary card over
 * the form (or the link-out CTA for an externally-registered event), plus the
 * post-submit confirmation.
 */
export const Default: Story<{ example: ExampleKey | DeadLink }> = ({ example }) => {
  const { locale } = useLocale()
  const { event, initialSubmitted } = EXAMPLES[example] ?? EXAMPLES['Native form']
  const eventPath = `/demo/${event.id}`
  const deadLink = DEAD_LINKS[example as DeadLink]

  return (
    <ViewHarness
      path={deadLink}
      seed={(client: QueryClient) => client.setQueryData<Event>(['event', event.id, locale], event)}
      seedKey={example}
    >
      {deadLink ? (
        <Thrower
          error={
            example === 'Not found · not an event' ? mockNotFound.nonEvent : mockNotFound.event
          }
        />
      ) : (
        <RegistrationView
          eventPath={eventPath}
          initialSubmitted={initialSubmitted}
          parentPath="/demo"
        />
      )}
    </ViewHarness>
  )
}

Default.storyName = 'Registration'
Default.meta = { width: 'xsmall' }
Default.args = { example: 'Native form' }
Default.argTypes = {
  example: {
    name: 'Example',
    options: [...Object.keys(EXAMPLES), ...Object.keys(DEAD_LINKS)],
    control: { type: 'radio' },
    defaultValue: 'Native form',
  },
}
