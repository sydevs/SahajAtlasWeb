import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { StoryErrorArg } from '@/views/story-harness'
import type { Region } from '@/types'

import { NO_ERROR, ViewStory, errorControl } from '@/views/story-harness'
import { RegionView } from '@/views/RegionView/RegionView'
import { useLocale } from '@/hooks/use-locale'
import {
  mockCityWithVenuesRegion,
  mockCountryRegion,
  mockLeafRegion,
  mockMinimalRegion,
} from '@/mocks/regions'

export default { title: 'Views' } satisfies StoryDefault

// Each example pairs the view's props with the query data it suspends on: RegionView keys
// on `['region', slug, locale]`. Every one renders at its region's OWN canonical path, so
// the Error control's dead-link case resolves the rung a viewer at that URL would actually
// get — see the story doc.
const EXAMPLES: Record<string, Region> = {
  Country: mockCountryRegion,
  City: mockLeafRegion,
  'City with Centers': mockCityWithVenuesRegion,
  Empty: mockMinimalRegion,
}

type ExampleKey = keyof typeof EXAMPLES

/**
 * RegionView — the drawer screen for a region at any level. "Country" is a large
 * parent whose events all sit under its child regions; "City" lists only its own
 * events with online ones inline; "City with Centers" is a city whose children are
 * SY Centers (venues), led by an "Online Classes" roll-up; "Empty" renders
 * EmptyEventList, which is the very same `FallbackPanel` the Error control renders —
 * on the `empty` row of the same policy table, so a barren region gets the same way out
 * as a URL that never existed (issue #89).
 *
 * **The two axes multiply, and the recovery rung falls out of the example.** Each case
 * renders at its own `region.path`, so "Not found · place" shows what that URL can offer,
 * with no per-error configuration anywhere:
 *
 *  - **City** (`/united-kingdom/cambridgeshire/cambridge`) → the ladder drops the failing
 *    terminal and finds **Cambridgeshire** in the region tree: the under-a-region variant.
 *  - **City with Centers** (`…/greater-london/london`) → **Greater London**, the same rung
 *    one level up.
 *  - **Country** (`/united-kingdom`) → nothing above it, so the ladder falls past rung 1
 *    to the cached IP guess: **"See events near Cambridge"**. That IS the top-level
 *    variant — the bare "Browse all countries" floor only appears when even the guess is
 *    absent (Molecules › Fallbacks shows it).
 */
export const Default: Story<{ example: ExampleKey; error: StoryErrorArg }> = ({
  example,
  error,
}) => {
  const { locale } = useLocale()
  const region = EXAMPLES[example] ?? EXAMPLES.Country

  return (
    <ViewStory
      error={error}
      example={example}
      path={region.path}
      seed={(client: QueryClient) =>
        client.setQueryData<Region>(['region', region.slug, locale], region)
      }
    >
      <RegionView slug={region.slug} />
    </ViewStory>
  )
}

Default.storyName = 'Region'
Default.meta = { width: 'xsmall' }
Default.args = { example: 'Country', error: NO_ERROR }
Default.argTypes = {
  example: {
    name: 'Example',
    options: Object.keys(EXAMPLES),
    control: { type: 'radio' },
    defaultValue: 'Country',
  },
  // A slug the region tree doesn't carry — a renamed CMS slug in an old bookmark, or a
  // typo. The one dead link this view's routes can produce.
  error: errorControl('Not found · place'),
}
