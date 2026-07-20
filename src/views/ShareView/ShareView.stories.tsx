import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { Event } from '@/types'

import { ViewHarness } from '@/views/story-harness'
import { ShareView } from '@/views/ShareView/ShareView'
import { useLocale } from '@/hooks/use-locale'
import { mockEvent } from '@/mocks/events'

export default { title: 'Views' } satisfies StoryDefault

const CASES: Record<string, Event> = {
  'In person': mockEvent,
  Online: { ...mockEvent, id: 321, eventType: 'online', languages: ['fr'] },
}

type CaseKey = keyof typeof CASES

/**
 * ShareView — the share drawer screen: the event summary card over the copyable
 * link + social-share row.
 */
export const Default: Story<{ case: CaseKey }> = ({ case: key }) => {
  const { locale } = useLocale()
  const event = CASES[key]

  return (
    <ViewHarness
      seed={(client: QueryClient) => client.setQueryData<Event>(['event', event.id, locale], event)}
      seedKey={key}
    >
      <ShareView eventPath={`/demo/${event.id}`} />
    </ViewHarness>
  )
}

Default.storyName = 'Share View'
Default.args = { case: 'In person' }
Default.argTypes = {
  case: { options: Object.keys(CASES), control: { type: 'select' }, defaultValue: 'In person' },
}
