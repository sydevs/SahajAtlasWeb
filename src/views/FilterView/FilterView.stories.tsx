import type { Story, StoryDefault } from '@ladle/react'

import { ViewHarness } from '@/views/story-harness'
import { FilterView } from '@/views/FilterView/FilterView'
import { DEFAULT_FILTERS } from '@/lib/shape'

export default { title: 'Views' } satisfies StoryDefault

// A mix of selections that differ from the (empty) applied filters, so the form opens filled
// AND dirty — the Apply bar is active, and "Clear all" shows too. The language options resolve
// from the cached feed the harness seeds; the region picker is left alone (no region tree here).
const dirtyDraft = {
  ...DEFAULT_FILTERS,
  format: 'online' as const,
  cadence: 'WEEKLY' as const,
  daysOfWeek: [1, 3, 5],
  timeOfDay: ['morning' as const],
  languages: ['en', 'fr'],
}

/**
 * FilterView — the filter form drawer: format / frequency / day / time / language controls,
 * plus the Apply bar. Previewed in a filled + dirty state (Apply active), the state you reach
 * after editing the form: several filters selected while nothing is applied yet.
 */
export const Default: Story = () => (
  <ViewHarness seed={() => {}} seedKey="filter">
    <FilterView initialDraft={dirtyDraft} />
  </ViewHarness>
)

Default.storyName = 'Filter'
Default.meta = { width: 'xsmall' }
