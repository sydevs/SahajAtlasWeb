import type { Story, StoryDefault } from '@ladle/react'

import { useEffect } from 'react'

import { StoryWrapper, StorySection } from '../../ladle'

import { ActiveFilterPills } from './ActiveFilterPills'

import { useSearchState } from '@/config/store'
import { DEFAULT_FILTERS } from '@/lib/shape'

export default {
  title: 'Molecules',
} satisfies StoryDefault

/** ActiveFilterPills — the applied filters as removable pills (one per filter type). */
export const ActiveFilterPillsStory: Story = () => {
  // Seed the shared filter store with a mix of active filters; reset on unmount.
  useEffect(() => {
    useSearchState.setState({
      ...DEFAULT_FILTERS,
      format: 'online',
      cadence: 'WEEKLY',
      daysOfWeek: [1, 3, 5],
      timeOfDay: [9, 17],
      languages: ['en', 'fr'],
    })

    return () => useSearchState.setState({ ...DEFAULT_FILTERS })
  }, [])

  return (
    <StoryWrapper>
      <StorySection
        description="The applied filters as removable pills — the day-of-week and language selections each collapse into one pill. The optional distance cap (search-only) leads the row."
        title="Active filter pills"
      >
        <ActiveFilterPills nearby={{ km: 500, onClear: () => {} }} />
      </StorySection>

      <div />
    </StoryWrapper>
  )
}

ActiveFilterPillsStory.storyName = 'ActiveFilterPills'
