import type { Story, StoryDefault } from '@ladle/react'

import { SeedSearchParams } from '@/components/ladle/SeedSearchParams'
import { ViewHarness } from '@/views/story-harness'
import { FiltersPanel } from '@/views/FilterView/FiltersPanel'
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

// Stable per case, as `SeedSearchParams` asks.
const PANEL_CASES = {
  'Nothing chosen': new URLSearchParams(),
  'Tuesday evening, online': new URLSearchParams('days=2&time=evening&format=online'),
} as const

/**
 * FiltersPanel — the filters on a computer: a panel over the map's right side, open from the first
 * load with every question showing. Each tap applies at once; the footer counts the classes and
 * offers Clear once something is chosen. Closing it lasts for the visit (the Filters button opens
 * it again).
 */
export const Panel: Story<{ state: keyof typeof PANEL_CASES }> = ({ state }) => (
  <ViewHarness path="/search" seedKey={`panel·${state}`}>
    <SeedSearchParams params={PANEL_CASES[state]}>
      <FiltersPanel />
    </SeedSearchParams>
  </ViewHarness>
)

Panel.storyName = 'Filters panel'
Panel.args = { state: 'Nothing chosen' }
Panel.argTypes = {
  state: {
    name: 'State',
    options: Object.keys(PANEL_CASES),
    control: { type: 'radio' },
    defaultValue: 'Nothing chosen',
  },
}
