import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { Event } from '@/types'

import { ViewHarness } from '@/views/story-harness'
import { RegistrationView } from '@/views/RegistrationView/RegistrationView'
import { useLocale } from '@/hooks/use-locale'
import { mockEvent } from '@/mocks/events'

export default { title: 'Views' } satisfies StoryDefault

// RegistrationView resolves its event from the path (`useEventFromPath` →
// `['event', id, locale]`), so each case seeds that key for the path's terminal id.
const CASES: Record<string, Event> = {
  'Native form': mockEvent,
  Online: { ...mockEvent, id: 311, eventType: 'online' },
  External: {
    ...mockEvent,
    id: 312,
    registrationMode: 'external',
    externalRegistrationUrl: 'https://example.org/register',
  },
}

type CaseKey = keyof typeof CASES

/**
 * RegistrationView — the registration drawer screen: the event summary card over
 * the form (or the link-out CTA for an externally-registered event).
 */
export const Default: Story<{ case: CaseKey }> = ({ case: key }) => {
  const { locale } = useLocale()
  const event = CASES[key]
  const eventPath = `/demo/${event.id}`

  return (
    <ViewHarness
      seed={(client: QueryClient) => client.setQueryData<Event>(['event', event.id, locale], event)}
      seedKey={key}
    >
      <RegistrationView eventPath={eventPath} parentPath="/demo" />
    </ViewHarness>
  )
}

Default.storyName = 'Registration View'
Default.args = { case: 'Native form' }
Default.argTypes = {
  case: { options: Object.keys(CASES), control: { type: 'select' }, defaultValue: 'Native form' },
}
