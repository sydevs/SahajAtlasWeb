import type { Story, StoryDefault } from '@ladle/react'

import { ViewHarness } from '@/views/story-harness'
import { FilterView } from '@/views/FilterView/FilterView'

export default { title: 'Views' } satisfies StoryDefault

/**
 * FilterView — the filter form drawer: format / frequency / day / time / language
 * controls, plus an Apply bar. Fully controlled off the URL filters (all default
 * here); the language options are derived from the cached feed the harness seeds.
 */
export const Default: Story = () => (
  <ViewHarness seed={() => {}} seedKey="default">
    <FilterView />
  </ViewHarness>
)

Default.storyName = 'Filter'
Default.meta = { width: 'xsmall' }
