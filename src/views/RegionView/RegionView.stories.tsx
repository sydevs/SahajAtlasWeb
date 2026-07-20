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

// A region shows child-region cards AND its own located events together (the mixed
// shape): a city can hold both venues/centres and free-floating events, and both
// render in one list. A region with sub-regions leads with an "Online Classes" roll-up
// card; one without lists its online events inline. Each example pairs the view's props
// with the query data it suspends on: RegionView keys on `['region', slug, locale]`.
const EXAMPLES = {
  Mixed: {
    slug: mockParentRegion.slug,
    region: mockParentRegion,
  },
  Country: {
    slug: mockCountryRegion.slug,
    region: mockCountryRegion,
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
 * RegionView — the drawer screen for a region at any level. "Mixed" shows child-region
 * cards AND the region's own free-floating events in one list (led by an "Online
 * Classes" roll-up); "Country" is a large parent whose events all sit under its child
 * regions; "Leaf city" lists only its own events with online ones inline; "Empty" is
 * the no-events state (unreachable in the app — getRegion 404s a 0-event region).
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
Default.args = { example: 'Mixed' }
Default.argTypes = {
  example: {
    name: 'Example',
    options: Object.keys(EXAMPLES),
    control: { type: 'radio' },
    defaultValue: 'Mixed',
  },
}
