import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { Event } from '@/types'

import { ViewHarness } from '@/views/story-harness'
import { RegistrationView } from '@/views/RegistrationView/RegistrationView'
import { useLocale } from '@/hooks/use-locale'
import { mockEvent } from '@/mocks/events'

export default { title: 'Views' } satisfies StoryDefault

// RegistrationView resolves its event from the path (`useEventFromPath` →
// `['event', id, locale]`), so each example seeds that key for the path's terminal id.
// `Confirmation` starts the native form on its post-submit thank-you screen.
const EXAMPLES: Record<string, { event: Event; initialSubmitted?: boolean }> = {
  'Native form': { event: mockEvent },
  Confirmation: { event: { ...mockEvent, id: 313 }, initialSubmitted: true },
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

/**
 * RegistrationView — the registration drawer screen: the event summary card over
 * the form (or the link-out CTA for an externally-registered event), plus the
 * post-submit confirmation.
 */
export const Default: Story<{ example: ExampleKey }> = ({ example }) => {
  const { locale } = useLocale()
  const { event, initialSubmitted } = EXAMPLES[example]
  const eventPath = `/demo/${event.id}`

  return (
    <ViewHarness
      seed={(client: QueryClient) => client.setQueryData<Event>(['event', event.id, locale], event)}
      seedKey={example}
    >
      <RegistrationView
        eventPath={eventPath}
        initialSubmitted={initialSubmitted}
        parentPath="/demo"
      />
    </ViewHarness>
  )
}

Default.storyName = 'Registration'
Default.meta = { width: 'xsmall' }
Default.args = { example: 'Native form' }
Default.argTypes = {
  example: {
    name: 'Example',
    options: Object.keys(EXAMPLES),
    control: { type: 'radio' },
    defaultValue: 'Native form',
  },
}
