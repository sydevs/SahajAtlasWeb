import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { Region } from '@/types'

import { ViewHarness } from '@/views/story-harness'
import { RegionView } from '@/views/RegionView/RegionView'
import { useLocale } from '@/hooks/use-locale'
import {
  mockCityWithVenuesRegion,
  mockCountryRegion,
  mockLeafRegion,
  mockMinimalRegion,
} from '@/mocks/regions'

export default { title: 'Views' } satisfies StoryDefault

// Each example pairs the view's props with the query data it suspends on:
// RegionView keys on `['region', slug, locale]`. "Country" is a large parent whose
// events all sit under its child regions; "City" is a leaf that lists only its own
// events (online ones inline); "City with Centers" is a city whose children are SY
// Centers, led by an "Online Classes" roll-up; "Empty" is the no-events state — a real
// screen since #89, not an error page (getRegion no longer 404s a 0-event region).
const EXAMPLES = {
  Country: {
    slug: mockCountryRegion.slug,
    region: mockCountryRegion,
  },
  City: {
    slug: mockLeafRegion.slug,
    region: mockLeafRegion,
  },
  'City with Centers': {
    slug: mockCityWithVenuesRegion.slug,
    region: mockCityWithVenuesRegion,
  },
  Empty: {
    slug: mockMinimalRegion.slug,
    region: mockMinimalRegion,
  },
} as const

type ExampleKey = keyof typeof EXAMPLES

/**
 * RegionView — the drawer screen for a region at any level. "Country" is a large
 * parent whose events all sit under its child regions; "City" lists only its own
 * events with online ones inline; "City with Centers" is a city whose children are
 * SY Centers (venues), led by an "Online Classes" roll-up; "Empty" renders
 * EmptyEventList — deliberately action-less, since a region whose events have all
 * ended is neither a wrong turn nor something a retry could fix (issue #89).
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
