import type { Story, StoryDefault } from '@ladle/react'
import type { Geojson } from '@/types'

import { useMemo, useState } from 'react'

import { StoryWrapper, StorySection } from '../../ladle'

import { SearchFilters } from './SearchFilters'

import { mockEventSlimList } from '@/mocks/events'
import { DEFAULT_FILTERS, facetCounts, scopeFacets } from '@/lib/shape'

export default {
  title: 'Organisms',
} satisfies StoryDefault

// A few distinct language sets, so the Language question has options to count.
const LANGUAGE_SETS = [['en'], ['fr'], ['hi', 'en'], ['de']]

const mockGeojson: Geojson = {
  type: 'FeatureCollection',
  features: mockEventSlimList.map((slim, index) => ({
    type: 'Feature',
    geometry: null,
    // The feed is locale-agnostic, with no `title`. The form only reads `languages` off it.
    properties: {
      id: slim.id,
      eventType: slim.eventType,
      languages: LANGUAGE_SETS[index % LANGUAGE_SETS.length],
      address: slim.address,
      schedule: slim.schedule,
      region: slim.region,
      webPath: slim.webPath,
    },
  })),
}

const scope = mockGeojson.features.map((feature) => feature.properties)
const { relevance } = scopeFacets(scope)

/** SearchFilters — the event-filters form, as rendered inside the FilterView drawer. */
export const Default: Story = () => {
  const [plain, setPlain] = useState(DEFAULT_FILTERS)
  const [counted, setCounted] = useState(DEFAULT_FILTERS)
  const facets = useMemo(() => ({ counts: facetCounts(scope, counted), relevance }), [counted])

  return (
    <StoryWrapper>
      <StorySection
        description="Before the feed loads: every question but Language, with no numbers. Frequency and Dates sit under More filters."
        title="Without counts"
      >
        <div className="max-w-sm rounded-lg border border-divider p-4">
          <SearchFilters value={plain} onChange={setPlain} />
        </div>
      </StorySection>

      <StorySection
        description="With the feed: each option shows how many classes it leaves, an option that leaves none is disabled unless selected, and a question that cannot narrow this scope is not asked."
        title="With counts"
      >
        <div className="max-w-sm rounded-lg border border-divider p-4">
          <SearchFilters facets={facets} value={counted} onChange={setCounted} />
        </div>
      </StorySection>
    </StoryWrapper>
  )
}

Default.storyName = 'Search Filters'
