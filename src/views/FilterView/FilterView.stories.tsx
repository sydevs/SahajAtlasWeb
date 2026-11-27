import type { Story, StoryDefault } from '@ladle/react'

import { useMemo } from 'react'
import { DateTime } from 'luxon'

import { SeedSearchParams } from '@/components/ladle'
import { ViewHarness } from '@/views/story-harness'
import { FilterView } from '@/views/FilterView/FilterView'
import { geojsonQuery } from '@/config/api'
import { mockEventSlim } from '@/mocks/events'
import { mockGeojson } from '@/mocks/regions'

export default { title: 'Views' } satisfies StoryDefault

// Each case is the URL the filters read: every tap writes it, so a case is its query string.
const EXAMPLES = {
  'Nothing picked': '',
  'A pick': 'format=online',
  'No match': 'days=1&time=evening',
  'No single way out': 'days=2&time=evening',
  'Night classes': '',
} as const

type Example = keyof typeof EXAMPLES

/**
 * The feed plus an online class starting at 02:00 on the viewer's own clock, the time an online
 * class from far away reads in, so Night is offered whatever zone the story is opened in.
 */
const withNightClass = () => {
  const start = DateTime.local().plus({ days: 1 }).set({ hour: 2, minute: 0, second: 0 })

  return {
    ...mockGeojson,
    features: [
      ...mockGeojson.features,
      {
        type: 'Feature' as const,
        id: 199,
        geometry: null,
        properties: {
          id: 199,
          eventType: 'online' as const,
          languages: ['en'],
          region: mockEventSlim.region,
          schedule: { ...mockEventSlim.schedule!, upcomingDates: [start.toJSDate()] },
          webPath: '/united-kingdom/199',
        },
      },
    ],
  }
}

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
    <ViewHarness
      path="/filters"
      seed={(client) => {
        if (example === 'Night classes') {
          client.setQueryData(geojsonQuery().queryKey, withNightClass())
        }
      }}
      seedKey={`filter-${example}`}
    >
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
