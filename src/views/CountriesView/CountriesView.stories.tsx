import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { RegionListItem } from '@/types'

import { ViewHarness } from '@/views/story-harness'
import { CountriesView } from '@/views/CountriesView/CountriesView'
import { mockCountries } from '@/mocks/regions'

export default { title: 'Views' } satisfies StoryDefault

const CASES = {
  'All countries': mockCountries,
  'Single country': mockCountries.slice(0, 1),
} as const

type CaseKey = keyof typeof CASES

/**
 * CountriesView — the root screen: the geocoder search + filter, an "Online
 * Classes" entry (its count read from the feed), then the global country list.
 */
export const Default: Story<{ case: CaseKey }> = ({ case: key }) => (
  <ViewHarness
    seed={(client: QueryClient) => client.setQueryData<RegionListItem[]>(['countries'], CASES[key])}
    seedKey={key}
  >
    <CountriesView />
  </ViewHarness>
)

Default.storyName = 'Countries View'
Default.args = { case: 'All countries' }
Default.argTypes = {
  case: { options: Object.keys(CASES), control: { type: 'select' }, defaultValue: 'All countries' },
}
