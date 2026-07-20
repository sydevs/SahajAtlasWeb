import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { Region } from '@/types'

import { ViewHarness } from '@/views/story-harness'
import { RegionView } from '@/views/RegionView/RegionView'
import { useLocale } from '@/hooks/use-locale'
import {
  mockCountryRegion,
  mockLeafRegion,
  mockMinimalRegion,
  mockParentRegion,
} from '@/mocks/regions'

export default { title: 'Views' } satisfies StoryDefault

// A region is EITHER a parent (child-region cards + an online roll-up) OR a leaf
// (its own event gallery, online events inline) — never both. Each example pairs the
// view's props with the query data it suspends on: RegionView keys on
// `['region', slug, locale]`, so the seed writes exactly that.
const EXAMPLES = {
  Country: {
    slug: mockCountryRegion.slug,
    region: mockCountryRegion,
  },
  Parent: {
    slug: mockParentRegion.slug,
    region: mockParentRegion,
  },
  'Leaf city': {
    slug: mockLeafRegion.slug,
    region: mockLeafRegion,
  },
  Empty: {
    slug: mockMinimalRegion.slug,
    region: mockMinimalRegion,
  },
} as const

type ExampleKey = keyof typeof EXAMPLES

/**
 * RegionView — the drawer screen for a region at any level. A full parent (Country)
 * shows child-region cards led by an "Online Classes" roll-up; a minimal Parent has
 * a single child and no roll-up; a leaf shows its located events with any online ones
 * inline; "Empty" shows the (defensive) no-events state.
 */
export const Default: Story<{ example: ExampleKey }> = ({ example }) => {
  const { locale } = useLocale()
  const c = EXAMPLES[example]

  return (
    <ViewHarness
      seed={(client: QueryClient) =>
        client.setQueryData<Region>(['region', c.slug, locale], c.region)
      }
      seedKey={example}
    >
      <RegionView slug={c.slug} />
    </ViewHarness>
  )
}

Default.storyName = 'Region'
Default.meta = { width: 'xsmall' }
Default.args = { example: 'Country' }
Default.argTypes = {
  example: {
    name: 'Example',
    options: Object.keys(EXAMPLES),
    control: { type: 'radio' },
    defaultValue: 'Country',
  },
}
