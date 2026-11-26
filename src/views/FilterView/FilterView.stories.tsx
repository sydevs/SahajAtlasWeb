import type { Story, StoryDefault } from '@ladle/react'

import { useMemo } from 'react'

import { SeedSearchParams } from '@/components/ladle'
import { ViewHarness } from '@/views/story-harness'
import { FilterView } from '@/views/FilterView/FilterView'

export default { title: 'Views' } satisfies StoryDefault

// Each case is the URL the filters read: every tap writes it, so a case is its query string.
const EXAMPLES = {
  'Nothing picked': '',
  'A pick': 'format=online',
  'No match': 'days=1&time=evening',
  'No single way out': 'days=2&time=evening',
} as const

type Example = keyof typeof EXAMPLES

/**
 * FilterView — the filter form drawer, which applies every tap at once. With nothing picked its
 * button reads Close; with an answer, "Show N classes" beside Clear all; when nothing matches it
 * says so and offers the one removal that brings the most classes back, or makes Clear all the way
 * out when no single removal helps. The language options and counts resolve from the cached feed
 * the harness seeds.
 *
 * **No error case, deliberately.** Every read here is non-suspense — `useQuery` for the feed,
 * `useRegionMatcher` over the cached region tree — so this view cannot reach an error boundary
 * at all. A failed feed just leaves the button without its count. It is the one view with no
 * story in `Views › Error States`. If a suspense read is ever added here, this story must then
 * gain a case (issue #89).
 */
export const Default: Story<{ example: Example }> = ({ example }) => {
  // Stable per case, so `SeedSearchParams` seeds once rather than on every render.
  const params = useMemo(() => new URLSearchParams(EXAMPLES[example]), [example])

  return (
    <ViewHarness path="/filters" seed={() => {}} seedKey={`filter-${example}`}>
      <SeedSearchParams params={params}>
        <FilterView />
      </SeedSearchParams>
    </ViewHarness>
  )
}

Default.storyName = 'Filter'
Default.meta = { width: 'xsmall' }
Default.argTypes = {
  example: {
    name: 'Example',
    options: Object.keys(EXAMPLES),
    control: { type: 'radio' },
    defaultValue: 'Nothing picked',
  },
}
