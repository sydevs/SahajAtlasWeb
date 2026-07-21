import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { RegionListItem } from '@/types'

import { ViewHarness } from '@/views/story-harness'
import { CountriesView } from '@/views/CountriesView/CountriesView'
import { mockCountries } from '@/mocks/regions'

export default { title: 'Views' } satisfies StoryDefault

const EXAMPLES = {
  'All countries': mockCountries,
  'Single country': mockCountries.slice(0, 1),
} as const

type ExampleKey = keyof typeof EXAMPLES

/**
 * CountriesView — the root screen: the geocoder search + filter, an "Online
 * Classes" entry (its count read from the feed), then the global country list
 * (busiest first — the view sorts by event count).
 */
export const Default: Story<{ example: ExampleKey }> = ({ example }) => (
  <ViewHarness
    seed={(client: QueryClient) =>
      client.setQueryData<RegionListItem[]>(['countries'], EXAMPLES[example])
    }
    seedKey={example}
  >
    <CountriesView />
  </ViewHarness>
)

Default.storyName = 'Countries'
Default.meta = { width: 'xsmall' }
Default.args = { example: 'All countries' }
Default.argTypes = {
  example: {
    name: 'Example',
    options: Object.keys(EXAMPLES),
    control: { type: 'radio' },
    defaultValue: 'All countries',
  },
}
