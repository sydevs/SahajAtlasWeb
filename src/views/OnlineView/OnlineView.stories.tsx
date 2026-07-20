import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { Region } from '@/types'

import { ViewHarness } from '@/views/story-harness'
import { OnlineView } from '@/views/OnlineView/OnlineView'
import { useLocale } from '@/hooks/use-locale'
import { mockLeafRegion, mockParentRegion } from '@/mocks/regions'

export default { title: 'Views' } satisfies StoryDefault

// OnlineView lists a region's placeless online events (the `<region>/online`
// roll-up), keyed on `['region', regionSlug, locale]`.
const CASES = {
  'Region roll-up': mockParentRegion,
  'Single online class': {
    ...mockLeafRegion,
    onlineEvents: mockLeafRegion.onlineEvents.slice(0, 1),
  },
} as const

type CaseKey = keyof typeof CASES

/**
 * OnlineView — a region's online classes as a flat list (no places), reached from
 * the "Online Classes" card. Every event is online, so cards show the screen icon.
 */
export const Default: Story<{ case: CaseKey }> = ({ case: key }) => {
  const { locale } = useLocale()
  const region = CASES[key]

  return (
    <ViewHarness
      seed={(client: QueryClient) =>
        client.setQueryData<Region>(['region', region.slug, locale], region)
      }
      seedKey={key}
    >
      <OnlineView path={`${region.path}/online`} regionSlug={region.slug} />
    </ViewHarness>
  )
}

Default.storyName = 'Online View'
Default.args = { case: 'Region roll-up' }
Default.argTypes = {
  case: {
    options: Object.keys(CASES),
    control: { type: 'select' },
    defaultValue: 'Region roll-up',
  },
}
