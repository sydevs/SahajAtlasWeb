import type { Story, StoryDefault } from '@ladle/react'

import { useMemo } from 'react'

import { SeedSearchParams } from '@/components/ladle'
import { ViewHarness } from '@/views/story-harness'
import { FilterChipBar } from '@/views/FilterView/FilterChipBar'

export default { title: 'Views' } satisfies StoryDefault

// Each case is the URL the buttons read: every tap writes it, so a case is its query string.
const EXAMPLES = {
  'Nothing chosen': '',
  'Tuesday evening, online': 'days=2&time=evening&format=online',
} as const

type Example = keyof typeof EXAMPLES

/**
 * The filters on a computer: Where, When and Language as buttons, each opening a small menu with
 * the same questions and live counts as the phone's filters. A button with an answer is filled and
 * names it, and Clear leads the row once anything is chosen. Over the map the row sits at its top
 * right; this story shows the row on its own, as the calendar's header carries it.
 */
export const FilterChips: Story<{ example: Example }> = ({ example }) => {
  // Stable per case, so `SeedSearchParams` seeds once rather than on every render.
  const params = useMemo(() => new URLSearchParams(EXAMPLES[example]), [example])

  return (
    <ViewHarness path="/search" seedKey={`filter-chips-${example}`}>
      <SeedSearchParams params={params}>
        <div className="flex justify-end p-4">
          <FilterChipBar placement="inline" />
        </div>
      </SeedSearchParams>
    </ViewHarness>
  )
}

FilterChips.storyName = 'Filter chips'
FilterChips.argTypes = {
  example: {
    name: 'Example',
    options: Object.keys(EXAMPLES),
    control: { type: 'radio' },
    defaultValue: 'Nothing chosen',
  },
}
