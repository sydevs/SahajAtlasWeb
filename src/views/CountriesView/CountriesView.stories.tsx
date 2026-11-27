import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { StoryFallbackArg } from '@/views/story-harness'
import type { RegionListItem } from '@/types'

import { NO_ERROR, ViewStory, stateControl } from '@/views/story-harness'
import { CountriesView } from '@/views/CountriesView/CountriesView'
import { useApproxLocation } from '@/config/store'
import { mockApproxLocation, mockCountries } from '@/mocks/regions'

export default { title: 'Views' } satisfies StoryDefault

const EXAMPLES = {
  'All countries': mockCountries,
  'Single country': mockCountries.slice(0, 1),
} as const

type ExampleKey = keyof typeof EXAMPLES

// Where the visitor roughly is, as `/geo.js` would say: a town and its country, the country alone,
// or nothing.
const LOCATIONS = {
  'Guessed town': mockApproxLocation,
  'Country only': { countryCode: mockApproxLocation.countryCode },
  None: null,
} as const

type LocationKey = keyof typeof LOCATIONS

/**
 * CountriesView — the root screen. Its title and filter, the place search with the location line
 * under it ("Classes near Cambridge", or "Classes near me" without a guessed town), an "Online
 * classes" entry with its count read from the feed, then the global country list, the visitor's
 * own country first and the rest busiest first.
 *
 * The State control carries no not-found flavour. There is no slug to get wrong at the root, so
 * no dead link reaches it. What a viewer meets here is the first fetch of the session failing.
 * Unlike the app-level fallback, the drawer stack IS mounted here, so it renders in the root's
 * own chrome — geocoder, filters, collapse — with the panel top-left, where the country list
 * would have been.
 */
export const Default: Story<{
  example: ExampleKey
  location: LocationKey
  state: StoryFallbackArg
}> = ({ example, location, state }) => (
  <ViewStory
    example={`${example}·${location}`}
    seed={(client: QueryClient) => {
      client.setQueryData<RegionListItem[]>(['countries'], EXAMPLES[example] ?? [])
      useApproxLocation.setState({ location: LOCATIONS[location] ?? null, dismissed: false })
    }}
    state={state}
  >
    <CountriesView />
  </ViewStory>
)

Default.storyName = 'Countries'
Default.meta = { width: 'xsmall' }
Default.args = { example: 'All countries', location: 'Guessed town', state: NO_ERROR }
Default.argTypes = {
  example: {
    name: 'Example',
    options: Object.keys(EXAMPLES),
    control: { type: 'radio' },
    defaultValue: 'All countries',
  },
  location: {
    name: 'Location',
    options: Object.keys(LOCATIONS),
    control: { type: 'radio' },
    defaultValue: 'Guessed town',
  },
  state: stateControl(),
}
