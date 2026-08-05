import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { Region } from '@/types'

import { Thrower, ViewHarness, mockEventVariants } from '@/views/story-harness'
import { OnlineView } from '@/views/OnlineView/OnlineView'
import { useLocale } from '@/hooks/use-locale'
import { mockParentRegion } from '@/mocks/regions'
import { mockNotFound } from '@/mocks/errors'

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

// The roll-up resolves its PARENT region, so a bad parent slug (or a bare `/online`,
// where there is no preceding segment at all) fails here exactly as RegionView does —
// and inherits its wording, "that place", rather than growing an online-flavoured
// sentence of its own (issue #89).
const NOT_FOUND = 'Not found'

/**
 * OnlineView — a region's online classes as a flat list (no places), reached from
 * the "Online Classes" card. Every event is online, so cards show the screen icon.
 * "Empty" shows the no-events state.
 */
export const Default: Story<{ example: ExampleKey | typeof NOT_FOUND }> = ({ example }) => {
  const { locale } = useLocale()
  const region = EXAMPLES[example] ?? EXAMPLES['Region roll-up']

  return (
    <ViewHarness
      path={example === NOT_FOUND ? '/atlantis/online' : undefined}
      seed={(client: QueryClient) =>
        client.setQueryData<Region>(['region', region.slug, locale], region)
      }
      seedKey={example}
    >
      {example === NOT_FOUND ? (
        <Thrower error={mockNotFound.region} />
      ) : (
        <OnlineView path={`${region.path}/online`} regionSlug={region.slug} />
      )}
    </ViewHarness>
  )
}

Default.storyName = 'Online'
Default.meta = { width: 'xsmall' }
Default.args = { example: 'Region roll-up' }
Default.argTypes = {
  example: {
    name: 'Example',
    options: [...Object.keys(EXAMPLES), NOT_FOUND],
    control: { type: 'radio' },
    defaultValue: 'Region roll-up',
  },
}
