import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { Region } from '@/types'

import { Thrower, ViewHarness } from '@/views/story-harness'
import { RegionView } from '@/views/RegionView/RegionView'
import { useLocale } from '@/hooks/use-locale'
import { mockNotFound } from '@/mocks/errors'
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
const EXAMPLES: Record<string, { slug: string; region: Region; path?: string }> = {
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
  // A region whose events have all ended. Rendered at a real path so the onward offer
  // resolves its ANCESTOR (Cambridgeshire) rather than falling through to the IP guess —
  // the rung a viewer actually gets, and the one worth reviewing (issue #89).
  Empty: {
    slug: mockMinimalRegion.slug,
    region: mockMinimalRegion,
    path: `/gb/cambridgeshire/${mockMinimalRegion.slug}`,
  },
}

type ExampleKey = keyof typeof EXAMPLES

// The failure this view owns (issue #89): a slug the region tree doesn't carry — a
// renamed CMS slug in an old bookmark, or a typo. The two cases prove the ladder drops
// the FAILING terminal before walking: the first must offer Cambridgeshire, never
// `atlantis` back again.
const DEAD_LINKS = {
  'Not found · under a region': '/gb/cambridgeshire/atlantis',
  'Not found · top level': '/atlantis',
} as const

type DeadLink = keyof typeof DEAD_LINKS

/**
 * RegionView — the drawer screen for a region at any level. "Country" is a large
 * parent whose events all sit under its child regions; "City" lists only its own
 * events with online ones inline; "City with Centers" is a city whose children are
 * SY Centers (venues), led by an "Online Classes" roll-up; "Empty" renders
 * EmptyEventList, which is the very same `FallbackPanel` the dead-link cases below
 * render — on the `empty` row of the same policy table, so a barren region gets the
 * same way out as a URL that never existed (issue #89).
 */
export const Default: Story<{ example: ExampleKey | DeadLink }> = ({ example }) => {
  const { locale } = useLocale()
  const c = EXAMPLES[example as ExampleKey] ?? EXAMPLES.Country
  const deadLink = DEAD_LINKS[example as DeadLink]

  return (
    <ViewHarness
      path={deadLink ?? c.path}
      seed={(client: QueryClient) =>
        client.setQueryData<Region>(['region', c.slug, locale], c.region)
      }
      seedKey={example}
    >
      {deadLink ? <Thrower error={mockNotFound.region} /> : <RegionView slug={c.slug} />}
    </ViewHarness>
  )
}

Default.storyName = 'Region'
Default.meta = { width: 'xsmall' }
Default.args = { example: 'Country' }
Default.argTypes = {
  example: {
    name: 'Example',
    options: [...Object.keys(EXAMPLES), ...Object.keys(DEAD_LINKS)],
    control: { type: 'radio' },
    defaultValue: 'Country',
  },
}
