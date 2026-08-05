import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { RegionListItem } from '@/types'

import { Thrower, ViewHarness } from '@/views/story-harness'
import { CountriesView } from '@/views/CountriesView/CountriesView'
import { mockCountries } from '@/mocks/regions'
import { mockErrors } from '@/mocks/errors'

export default { title: 'Views' } satisfies StoryDefault

const EXAMPLES = {
  'All countries': mockCountries,
  'Single country': mockCountries.slice(0, 1),
} as const

type ExampleKey = keyof typeof EXAMPLES

// No dead link reaches the root — there is no slug to get wrong. What a viewer meets here
// is the first fetch of the session failing, so this previews `server`: the broken
// register (a danger alert, assertively announced) with Try again and Report an issue.
const SERVER = 'Server error'

/**
 * CountriesView — the root screen: the geocoder search + filter, an "Online
 * Classes" entry (its count read from the feed), then the global country list
 * (busiest first — the view sorts by event count).
 */
export const Default: Story<{ example: ExampleKey | typeof SERVER }> = ({ example }) => (
  <ViewHarness
    seed={(client: QueryClient) =>
      client.setQueryData<RegionListItem[]>(['countries'], EXAMPLES[example as ExampleKey] ?? [])
    }
    seedKey={example}
  >
    {example === SERVER ? <Thrower error={mockErrors.server} /> : <CountriesView />}
  </ViewHarness>
)

Default.storyName = 'Countries'
Default.meta = { width: 'xsmall' }
Default.args = { example: 'All countries' }
Default.argTypes = {
  example: {
    name: 'Example',
    options: [...Object.keys(EXAMPLES), SERVER],
    control: { type: 'radio' },
    defaultValue: 'All countries',
  },
}
