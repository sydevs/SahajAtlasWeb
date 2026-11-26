import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { StoryFallbackArg } from '@/views/story-harness'
import type { Region } from '@/types'

import { useMemo } from 'react'

import { SeedSearchParams } from '@/components/ladle'
import { regionQuery } from '@/config/api'
import { filtersFromParams } from '@/lib/shape'
import { EMPTY, EMPTY_FILTERED, NO_ERROR, ViewStory, stateControl } from '@/views/story-harness'
import { RegionView } from '@/views/RegionView/RegionView'
import { useLocale } from '@/hooks/use-locale'
import { mockCityWithVenuesRegion, mockCountryRegion, mockLeafRegion } from '@/mocks/regions'

export default { title: 'Views' } satisfies StoryDefault

// Each example pairs the view's props with the query data it suspends on: RegionView keys
// on `['region', slug, locale]`. Every one renders at its region's OWN canonical path, so
// the State control's dead-link case resolves the rung a viewer at that URL would actually
// get — see the story doc.
const EXAMPLES: Record<string, Region> = {
  Country: mockCountryRegion,
  City: mockLeafRegion,
  'City with Centers': mockCityWithVenuesRegion,
}

type ExampleKey = keyof typeof EXAMPLES

/** A days filter, so the filter button carries a badge and a pill names what emptied the list. */
const FILTERED = 'days=1,3'

/** Whatever region is selected, with nothing left to list — a region whose programs have
 *  all ended. This is derived, not a fixture of its own, so `Empty` is a state ANY example
 *  can appear in, and the header still names the region the reader chose. */
const emptied = (region: Region): Region => ({
  ...region,
  subregions: [],
  events: [],
  onlineEvents: [],
})

/**
 * RegionView — the drawer screen for a region at any level. "Country" is a large parent
 * whose events all sit under its child regions. "City" lists only its own events, with
 * online ones inline. "City with Centers" is a city whose children are SY Centers (venues),
 * led by an "Online classes" roll-up.
 *
 * **The two axes multiply, and both fall out of the example.** `Empty` empties whichever
 * region is selected. It is a state of a region, not a region of its own, so the header still
 * names the place the reader chose, and every example can appear barren. Each case also
 * renders at its own `region.path`, so "Not found · place" shows what that URL can offer,
 * with nothing configured per fallback:
 *
 *  - **City** (`/united-kingdom/cambridgeshire/cambridge`) → the ladder drops the failing
 *    terminal and finds **Cambridgeshire** in the region tree: the under-a-region variant.
 *  - **City with Centers** (`…/greater-london/london`) → **Greater London**, the same rung
 *    one level up.
 *  - **Country** (`/united-kingdom`) → nothing sits above it, so the ladder falls past rung 1
 *    to the cached IP guess: **"See classes near Cambridge"**. That IS the top-level variant.
 *    The bare "Browse all countries" floor only appears when even the guess is absent
 *    (Molecules › Fallbacks shows it).
 *
 * `Empty · filtered` is `Empty` with two days filtered, so the panel offers "Clear all" instead.
 *
 * `Empty` and the not-found cases render the very same `FallbackPanel`, one policy row apart —
 * which is the point. A barren region gets the same way out as a URL that never existed
 * (issue #89). Put them side by side, and the only difference should be the sentence.
 */
export const Default: Story<{ example: ExampleKey; state: StoryFallbackArg }> = ({
  example,
  state,
}) => {
  const { locale } = useLocale()
  const base = EXAMPLES[example] ?? EXAMPLES.Country
  const region = state === EMPTY || state === EMPTY_FILTERED ? emptied(base) : base
  // Every state seeds the URL, the unfiltered ones with nothing: the decorator's router outlives
  // the story, so a filter left behind would key the next state's read on a query nobody seeded.
  // Memoized per state, since `SeedSearchParams` re-seeds on a new object.
  const params = useMemo(
    () => new URLSearchParams(state === EMPTY_FILTERED ? FILTERED : ''),
    [state],
  )

  return (
    <ViewStory
      example={example}
      path={region.path}
      seed={(client: QueryClient) => {
        // Under the unfiltered key too: the params land one render after the client.
        client.setQueryData<Region>(regionQuery(region.slug, locale).queryKey, region)
        client.setQueryData<Region>(
          regionQuery(region.slug, locale, filtersFromParams(new URLSearchParams(FILTERED)))
            .queryKey,
          region,
        )
      }}
      state={state}
    >
      <SeedSearchParams params={params}>
        <RegionView slug={region.slug} />
      </SeedSearchParams>
    </ViewStory>
  )
}

Default.storyName = 'Region'
Default.meta = { width: 'xsmall' }
Default.args = { example: 'Country', state: NO_ERROR }
Default.argTypes = {
  example: {
    name: 'Example',
    options: Object.keys(EXAMPLES),
    control: { type: 'radio' },
    defaultValue: 'Country',
  },
  // A slug the region tree does not carry — a renamed CMS slug in an old bookmark, or a
  // typo. The one dead link this view's routes can produce.
  state: stateControl(EMPTY, EMPTY_FILTERED, 'Not found · place'),
}
