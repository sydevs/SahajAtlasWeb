import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { Event } from '@/types'

import { ViewHarness } from '@/views/story-harness'
import { ShareView } from '@/views/ShareView/ShareView'
import { useLocale } from '@/hooks/use-locale'
import { mockEvent } from '@/mocks/events'

export default { title: 'Views' } satisfies StoryDefault

const EXAMPLES: Record<string, Event> = {
  'In person': mockEvent,
  Online: { ...mockEvent, id: 321, eventType: 'online', languages: ['fr'] },
}

type ExampleKey = keyof typeof EXAMPLES

/**
 * ShareView — the share drawer screen: the event summary card over the copyable
 * link + social-share row.
 */
export const Default: Story<{ example: ExampleKey }> = ({ example }) => {
  const { locale } = useLocale()
  const event = EXAMPLES[example]

  return (
    <ViewHarness
      seed={(client: QueryClient) => client.setQueryData<Event>(['event', event.id, locale], event)}
      seedKey={example}
    >
      <ShareView eventPath={`/demo/${event.id}`} />
    </ViewHarness>
  )
}

Default.storyName = 'Share'
Default.meta = { width: 'xsmall' }
Default.args = { example: 'In person' }
Default.argTypes = {
  example: {
    name: 'Example',
    options: Object.keys(EXAMPLES),
    control: { type: 'radio' },
    defaultValue: 'In person',
  },
}
