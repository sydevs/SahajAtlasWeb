import type { Story, StoryDefault } from '@ladle/react'

import { SeedSearchParams } from '@/components/ladle/SeedSearchParams'
import { ViewHarness } from '@/views/story-harness'
import { FilterChipBar } from '@/views/FilterView/FilterChipBar'
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
const CHIP_CASES = {
  'Nothing chosen': new URLSearchParams(),
  'Tuesday evening, online': new URLSearchParams('days=2&time=evening&format=online'),
} as const

/**
 * FilterChipBar — the filters on a computer: Where, When and Language along the top of the map,
 * each opening a small popover, and none open until pressed. Press a chip to see its popover; an
 * answered chip fills and names what's chosen, and Clear appears at the row's start.
 */
export const Chips: Story<{ state: keyof typeof CHIP_CASES }> = ({ state }) => (
  <ViewHarness path="/search" seedKey={`chips·${state}`}>
    <SeedSearchParams params={CHIP_CASES[state]}>
      <FilterChipBar />
    </SeedSearchParams>
  </ViewHarness>
)

Chips.storyName = 'Filter chips'
Chips.args = { state: 'Nothing chosen' }
Chips.argTypes = {
  state: {
    name: 'State',
    options: Object.keys(CHIP_CASES),
    control: { type: 'radio' },
    defaultValue: 'Nothing chosen',
  },
}
