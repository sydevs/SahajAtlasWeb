import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection, SeedSearchParams } from '../../ladle'

import { ActiveFilterPills } from './ActiveFilterPills'

import { filtersToParams } from '@/lib/shape'

export default {
  title: 'Molecules',
} satisfies StoryDefault

// A mix of active filters, seeded into the URL query — the filters' source of truth,
// which the pills read via useEventFilters.
const seededParams = filtersToParams({
  format: 'online',
  cadence: 'WEEKLY',
  daysOfWeek: [1, 3, 5],
  timeOfDay: ['morning', 'afternoon'],
  languages: ['en', 'fr'],
  dateRange: { start: null, end: null },
  region: null,
})

/** ActiveFilterPills — the applied filters as removable pills (one per filter type). */
export const Default: Story = () => (
  <SeedSearchParams params={seededParams}>
    <StoryWrapper>
      <StorySection
        description="The applied filters as removable pills — the day-of-week and language selections each collapse into one pill. The optional distance cap (search-only) leads the row."
        title="Active filter pills"
      >
        <ActiveFilterPills nearby={{ km: 500, onClear: () => {} }} />
      </StorySection>

      <div />
    </StoryWrapper>
  </SeedSearchParams>
)

Default.storyName = 'Active Filter Pills'
