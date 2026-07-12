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

// Seed the map's `['geojson']` cache (the panel reads language options from it)
// with a few distinct language sets, so the Language group has options to show.
const LANGUAGE_SETS = [['en'], ['fr'], ['hi', 'en'], ['de']]

const mockGeojson: Geojson = {
  type: 'FeatureCollection',
  features: mockEventSlimList.map((slim, index) => ({
    type: 'Feature',
    geometry: null,
    properties: { ...slim, languages: LANGUAGE_SETS[index % LANGUAGE_SETS.length] },
  })),
}

/** SearchFilters — the drawer-header filter button + panel. Click it to open. */
export const SearchFiltersStory: Story = () => {
  const queryClient = useQueryClient()

  useEffect(() => {
    queryClient.setQueryData(['geojson'], mockGeojson)
  }, [queryClient])

  return (
    <StoryWrapper>
      <StorySection
        description="A popover on desktop, a bottom-sheet dialog below md. Resize the preview to compare. The trigger shows a badge with the active-filter count."
        title="Event filters"
      >
        <div className="flex justify-end">
          <SearchFilters />
        </div>
      </StorySection>

      <div />
    </StoryWrapper>
  )
}

SearchFiltersStory.storyName = 'SearchFilters'
