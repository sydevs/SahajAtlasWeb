import type { Story, StoryDefault } from '@ladle/react'

import { MemoryRouter } from 'react-router'

import { StoryWrapper, StorySection } from '../../ladle'

import { ActiveFilterPills } from './ActiveFilterPills'

import { filtersToParams } from '@/lib/shape'

export default {
  title: 'Molecules',
} satisfies StoryDefault

// A mix of active filters, seeded into the URL query — the filters' source of truth,
// which the pills read via useEventFilters. A local MemoryRouter carries it.
const seededSearch = `/search?${filtersToParams({
  format: 'online',
  cadence: 'WEEKLY',
  daysOfWeek: [1, 3, 5],
  timeOfDay: [9, 17],
  languages: ['en', 'fr'],
  dateRange: { start: null, end: null },
}).toString()}`

/** ActiveFilterPills — the applied filters as removable pills (one per filter type). */
export const ActiveFilterPillsStory: Story = () => (
  <MemoryRouter initialEntries={[seededSearch]}>
    <StoryWrapper>
      <StorySection
        description="The applied filters as removable pills — the day-of-week and language selections each collapse into one pill. The optional distance cap (search-only) leads the row."
        title="Active filter pills"
      >
        <ActiveFilterPills nearby={{ km: 500, onClear: () => {} }} />
      </StorySection>

      <div />
    </StoryWrapper>
  </MemoryRouter>
)

ActiveFilterPillsStory.storyName = 'ActiveFilterPills'
