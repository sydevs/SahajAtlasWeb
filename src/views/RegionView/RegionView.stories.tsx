import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { Region } from '@/types'

import { ViewHarness } from '@/views/story-harness'
import { RegionView } from '@/views/RegionView/RegionView'
import { useLocale } from '@/hooks/use-locale'
import { mockLeafRegion, mockMinimalRegion, mockParentRegion } from '@/mocks/regions'

export default { title: 'Views' } satisfies StoryDefault

// Each case pairs the view's props with the query data it suspends on. RegionView
// keys on `['region', slug, locale]`, so the seed writes exactly that.
const CASES = {
  Parent: {
    slug: mockParentRegion.slug,
    region: mockParentRegion,
  },
  'Leaf city': {
    slug: mockLeafRegion.slug,
    region: mockLeafRegion,
  },
  'Minimal (no events)': {
    slug: mockMinimalRegion.slug,
    region: mockMinimalRegion,
  },
} as const

type CaseKey = keyof typeof CASES

/**
 * RegionView — the drawer screen for a region at any level: child-region cards,
 * this region's located events, and (on a parent) the online-classes roll-up.
 * Switch cases with the "case" control.
 */
export const Default: Story<{ case: CaseKey }> = ({ case: key }) => {
  const { locale } = useLocale()
  const c = CASES[key]

  return (
    <ViewHarness
      seed={(client: QueryClient) =>
        client.setQueryData<Region>(['region', c.slug, locale], c.region)
      }
      seedKey={key}
    >
      <RegionView slug={c.slug} />
    </ViewHarness>
  )
}

Default.storyName = 'Region View'
Default.args = { case: 'Parent' }
Default.argTypes = {
  case: { options: Object.keys(CASES), control: { type: 'select' }, defaultValue: 'Parent' },
}
