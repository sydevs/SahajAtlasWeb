import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { StoryFallbackArg } from '@/views/story-harness'
import type { Region } from '@/types'

import { EMPTY, NO_ERROR, ViewStory, stateControl, mockEventVariants } from '@/views/story-harness'
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
  'One class': { ...mockParentRegion, onlineEvents: onlineVariants.slice(0, 1) },
}

type ExampleKey = keyof typeof EXAMPLES

/**
 * OnlineView — a region's online classes as a flat list (no places), reached from
 * the "Online Classes" card. Every event is online, so cards show the screen icon.
 *
 * `Empty` is on the State control rather than being an example of its own: it is the
 * roll-up with nothing in it, which is a state any of these can be in. It renders the
 * same `FallbackPanel` the not-found case does, one policy row apart (issue #89).
 *
 * The roll-up resolves its PARENT region, so a bad parent slug fails here exactly as
 * RegionView does — and inherits its wording, "that place", rather than growing an
 * online-flavoured sentence of its own. Rendered at `<region>/online`, so the ladder drops
 * the failing `online` segment and offers the parent region by name.
 */
export const Default: Story<{ example: ExampleKey; state: StoryFallbackArg }> = ({
  example,
  state,
}) => {
  const { locale } = useLocale()
  const base = EXAMPLES[example] ?? EXAMPLES['Region roll-up']
  const region = state === EMPTY ? { ...base, onlineEvents: [] } : base
  const path = `${region.path}/online`

  return (
    <ViewStory
      example={example}
      path={path}
      seed={(client: QueryClient) =>
        client.setQueryData<Region>(['region', region.slug, locale], region)
      }
      state={state}
    >
      <OnlineView path={path} regionSlug={region.slug} />
    </ViewStory>
  )
}

Default.storyName = 'Online'
Default.meta = { width: 'xsmall' }
Default.args = { example: 'Region roll-up', state: NO_ERROR }
Default.argTypes = {
  example: {
    name: 'Example',
    options: Object.keys(EXAMPLES),
    control: { type: 'radio' },
    defaultValue: 'Region roll-up',
  },
  state: stateControl(EMPTY, 'Not found · place'),
}
