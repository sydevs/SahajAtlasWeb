import type { Story, StoryDefault } from '@ladle/react'
import type { Geojson } from '@/types'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { StoryWrapper, StorySection } from '../../ladle'

import { SearchFilters } from './SearchFilters'

import { mockEventSlimList } from '@/mocks/events'

export default {
  title: 'Molecules',
} satisfies StoryDefault

// Seed the map's `['geojson']` cache (the form reads language options from it)
// with a few distinct language sets, so the Language dropdown has options to show.
const LANGUAGE_SETS = [['en'], ['fr'], ['hi', 'en'], ['de']]

const mockGeojson: Geojson = {
  type: 'FeatureCollection',
  features: mockEventSlimList.map((slim, index) => ({
    type: 'Feature',
    geometry: null,
    properties: { ...slim, languages: LANGUAGE_SETS[index % LANGUAGE_SETS.length] },
  })),
}

/** SearchFilters — the event-filters form, as rendered inside the FilterView drawer. */
export const SearchFiltersStory: Story = () => {
  const queryClient = useQueryClient()

  useEffect(() => {
    queryClient.setQueryData(['geojson'], mockGeojson)
  }, [queryClient])

  return (
    <StoryWrapper>
      <StorySection
        description="Format / Frequency / Day-of-week / Time-of-day (two-handle range) / Language (multi-select dropdown). Writes to the shared useSearchState filter slice."
        title="Event filters form"
      >
        <div className="max-w-sm rounded-lg border border-divider p-4">
          <SearchFilters />
        </div>
      </StorySection>

      <div />
    </StoryWrapper>
  )
}

SearchFiltersStory.storyName = 'SearchFilters'
