import type { Story, StoryDefault } from '@ladle/react'

import { useEffect } from 'react'
import { useSearchParams } from 'react-router'

import { StoryWrapper, StorySection } from '../../ladle'

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
  timeOfDay: [9, 17],
  languages: ['en', 'fr'],
  dateRange: { start: null, end: null },
})

// Seed the query on the decorator's router rather than nesting a second
// MemoryRouter — react-router v7 throws "cannot render a <Router> inside another
// <Router>", which is what blanked this story.
function SeedFilters({ children }: { children: React.ReactNode }) {
  const [, setSearchParams] = useSearchParams()

  useEffect(() => {
    setSearchParams(seededParams, { replace: true })
  }, [setSearchParams])

  return <>{children}</>
}

/** ActiveFilterPills — the applied filters as removable pills (one per filter type). */
export const Default: Story = () => (
  <SeedFilters>
    <StoryWrapper>
      <StorySection
        description="The applied filters as removable pills — the day-of-week and language selections each collapse into one pill. The optional distance cap (search-only) leads the row."
        title="Active filter pills"
      >
        <ActiveFilterPills nearby={{ km: 500, onClear: () => {} }} />
      </StorySection>

      <div />
    </StoryWrapper>
  </SeedFilters>
)

Default.storyName = 'Active Filter Pills'
