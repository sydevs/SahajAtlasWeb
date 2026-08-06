import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { StoryErrorArg } from '@/views/story-harness'
import type { Region } from '@/types'

import { NO_ERROR, ViewStory, errorControl, mockEventVariants } from '@/views/story-harness'
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
 * "Empty" shows the no-events state — the same `FallbackPanel` the Error control renders,
 * one policy row apart (issue #89).
 *
 * The roll-up resolves its PARENT region, so a bad parent slug fails here exactly as
 * RegionView does — and inherits its wording, "that place", rather than growing an
 * online-flavoured sentence of its own. Rendered at `<region>/online`, so the ladder drops
 * the failing `online` segment and offers the parent region by name.
 */
export const Default: Story<{ example: ExampleKey; error: StoryErrorArg }> = ({
  example,
  error,
}) => {
  const { locale } = useLocale()
  const region = EXAMPLES[example] ?? EXAMPLES['Region roll-up']
  const path = `${region.path}/online`

  return (
    <ViewStory
      error={error}
      example={example}
      path={path}
      seed={(client: QueryClient) =>
        client.setQueryData<Region>(['region', region.slug, locale], region)
      }
    >
      <OnlineView path={path} regionSlug={region.slug} />
    </ViewStory>
  )
}

Default.storyName = 'Online'
Default.meta = { width: 'xsmall' }
Default.args = { example: 'Region roll-up', error: NO_ERROR }
Default.argTypes = {
  example: {
    name: 'Example',
    options: Object.keys(EXAMPLES),
    control: { type: 'radio' },
    defaultValue: 'Region roll-up',
  },
  error: errorControl('Not found · place'),
}
