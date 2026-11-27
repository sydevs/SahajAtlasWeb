import type { Story, StoryDefault } from '@ladle/react'

import { useEffect, useMemo } from 'react'

import { SeedSearchParams } from '@/components/ladle'
import { geojsonQuery } from '@/config/api'
import { mockCzechGeojson } from '@/mocks/regions'
import { refuseGeolocation } from '@/mocks/story-geolocation'
import { FilterChipBar } from '@/views/FilterView/FilterChipBar'
import { ViewHarness } from '@/views/story-harness'

export default { title: 'Organisms' } satisfies StoryDefault

// Each case is the URL the buttons read: every tap writes it, so a case is its query string.
const EXAMPLES = {
  'Nothing chosen': '',
  'Tuesday evening, online': 'days=2&time=evening&format=online',
  'Czech classes': '',
  'Location refused': '',
} as const

type Example = keyof typeof EXAMPLES

/**
 * FilterChips — the filters on a computer: Where, When and Language as buttons, each opening a
 * small menu with the same questions and live counts as the phone's filters. A button with an
 * answer is filled and names it, and Clear leads the row once anything is chosen. Over the map the
 * row sits at its top right; this story shows it on its own, as the calendar's header carries it.
 *
 * - **Czech classes**: press Language for Czech and English, each with its count.
 * - **Location refused**: this browser refuses the location. Press Where, then Near me, for the
 *   message and its way on to the search box.
 */
export const FilterChipsStory: Story<{ example: Example }> = ({ example }) => {
  // Stable per case, so `SeedSearchParams` seeds once rather than on every render.
  const params = useMemo(() => new URLSearchParams(EXAMPLES[example]), [example])

  useEffect(() => (example === 'Location refused' ? refuseGeolocation() : undefined), [example])

  return (
    <ViewHarness
      path="/search"
      seed={(client) => {
        if (example === 'Czech classes')
          client.setQueryData(geojsonQuery().queryKey, mockCzechGeojson)
      }}
      seedKey={`filter-chips-${example}`}
    >
      <SeedSearchParams params={params}>
        <div className="flex justify-end p-4">
          <FilterChipBar placement="inline" />
        </div>
      </SeedSearchParams>
    </ViewHarness>
  )
}

FilterChipsStory.storyName = 'Filter chips'
FilterChipsStory.argTypes = {
  example: {
    name: 'Example',
    options: Object.keys(EXAMPLES),
    control: { type: 'radio' },
    defaultValue: 'Nothing chosen',
  },
}
