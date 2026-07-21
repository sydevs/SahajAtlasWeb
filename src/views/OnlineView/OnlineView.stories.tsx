import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { Region } from '@/types'

import { ViewHarness, mockEventVariants } from '@/views/story-harness'
import { OnlineView } from '@/views/OnlineView/OnlineView'
import { useLocale } from '@/hooks/use-locale'
import { mockParentRegion } from '@/mocks/regions'

export default { title: 'Views' } satisfies StoryDefault

// Every event in this view is online, so present the shared variant gallery as
// online classes (their location details give way to the hosted-from line).
const onlineVariants = mockEventVariants.map((event) => ({
  ...event,
  eventType: 'online' as const,
}))

// OnlineView lists a region's placeless online events (the `<region>/online`
// roll-up), keyed on `['region', regionSlug, locale]`.
const EXAMPLES: Record<string, Region> = {
  'Region roll-up': { ...mockParentRegion, onlineEvents: onlineVariants },
  Empty: { ...mockParentRegion, onlineEvents: [] },
}

type ExampleKey = keyof typeof EXAMPLES

/**
 * OnlineView — a region's online classes as a flat list (no places), reached from
 * the "Online Classes" card. Every event is online, so cards show the screen icon.
 * "Empty" shows the no-events state.
 */
export const Default: Story<{ example: ExampleKey }> = ({ example }) => {
  const { locale } = useLocale()
  const region = EXAMPLES[example]

  return (
    <ViewHarness
      seed={(client: QueryClient) =>
        client.setQueryData<Region>(['region', region.slug, locale], region)
      }
      seedKey={example}
    >
      <OnlineView path={`${region.path}/online`} regionSlug={region.slug} />
    </ViewHarness>
  )
}

Default.storyName = 'Online'
Default.meta = { width: 'xsmall' }
Default.args = { example: 'Region roll-up' }
Default.argTypes = {
  example: {
    name: 'Example',
    options: Object.keys(EXAMPLES),
    control: { type: 'radio' },
    defaultValue: 'Region roll-up',
  },
}
