import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { Geojson } from '@/types'

import { ViewHarness } from '@/views/story-harness'
import { FilterView } from '@/views/FilterView/FilterView'
import { mockGeojson } from '@/mocks/regions'

export default { title: 'Views' } satisfies StoryDefault

// FilterView derives its language options from the distinct codes in the cached
// feed, so a case just overrides `['geojson']` with a different language spread.
const manyLanguages: Geojson = {
  ...mockGeojson,
  features: mockGeojson.features.map((f, i) => ({
    ...f,
    properties: { ...f.properties, languages: [['en', 'fr', 'de', 'es', 'cs', 'uk'][i] ?? 'en'] },
  })),
}

const CASES: Record<string, Geojson> = {
  'Few languages': mockGeojson,
  'Many languages': manyLanguages,
}

type CaseKey = keyof typeof CASES

/**
 * FilterView — the filter form drawer: format / frequency / day / time / language
 * controls, plus an Apply bar. Fully controlled off the URL filters (all default
 * here); the language options come from the feed.
 */
export const Default: Story<{ case: CaseKey }> = ({ case: key }) => (
  <ViewHarness
    seed={(client: QueryClient) => client.setQueryData<Geojson>(['geojson'], CASES[key])}
    seedKey={key}
  >
    <FilterView />
  </ViewHarness>
)

Default.storyName = 'Filter View'
Default.args = { case: 'Few languages' }
Default.argTypes = {
  case: { options: Object.keys(CASES), control: { type: 'select' }, defaultValue: 'Few languages' },
}
