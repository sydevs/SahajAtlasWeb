import type { Story, StoryDefault } from '@ladle/react'

import { ViewHarness } from '@/views/story-harness'
import { FilterView } from '@/views/FilterView/FilterView'
import { DEFAULT_FILTERS } from '@/lib/shape'

export default { title: 'Views' } satisfies StoryDefault

// A mix of selections that differ from the empty applied filters, so the form opens filled AND
// dirty. The Apply bar is active, and "Clear all" shows too. The language options resolve from
// the cached feed the harness seeds. The region picker resolves from the region tree it seeds
// (`mockRegionNodes`). This draft leaves the region unset, so that control shows "All regions".
const dirtyDraft = {
  ...DEFAULT_FILTERS,
  format: 'online' as const,
  cadence: 'WEEKLY' as const,
  daysOfWeek: [1, 3, 5],
  timeOfDay: ['morning' as const],
  languages: ['en', 'fr'],
}

/**
 * FilterView — the filter form drawer: format, frequency, day, time, and language controls,
 * plus the Apply bar. This preview shows a filled and dirty state, with Apply active — the
 * state reached after editing the form, where several filters are selected but nothing is
 * applied yet.
 *
 * **No error case, deliberately.** Every read here is non-suspense — `useQuery` for the feed,
 * `useRegionMatcher` over the cached region tree — so this view cannot reach an error boundary
 * at all. A failed feed just leaves Apply without its count. It is the one view with no story
 * in `Views › Error States`. If a suspense read is ever added here, this story must then gain a
 * case (issue #89).
 */
export const Default: Story = () => (
  <ViewHarness seed={() => {}} seedKey="filter">
    <FilterView initialDraft={dirtyDraft} />
  </ViewHarness>
)

Default.storyName = 'Filter'
Default.meta = { width: 'xsmall' }
