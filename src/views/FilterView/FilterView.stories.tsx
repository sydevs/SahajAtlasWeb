import type { Story, StoryDefault } from '@ladle/react'

import { ViewHarness } from '@/views/story-harness'
import { FilterView } from '@/views/FilterView/FilterView'

export default { title: 'Views' } satisfies StoryDefault

/**
 * FilterView — the filter form drawer, with its always-visible footer. There is no draft: tapping
 * an option writes the URL, so the count in the footer moves with the tap.
 *
 * **No error case, deliberately.** Every read here is non-suspense — `useQuery` for the feed,
 * `useRegionMatcher` over the cached region tree — so this view cannot reach an error boundary
 * at all. A failed feed just leaves the button without its count. It is the one view with no
 * story in `Views › Error States`. If a suspense read is ever added here, this story must then
 * gain a case (issue #89).
 */
export const Default: Story = () => (
  <ViewHarness seed={() => {}} seedKey="filter">
    <FilterView />
  </ViewHarness>
)

Default.storyName = 'Filter'
Default.meta = { width: 'xsmall' }
