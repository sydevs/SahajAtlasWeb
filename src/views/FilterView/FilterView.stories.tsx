import type { Story, StoryDefault } from '@ladle/react'

import { useEffect, useMemo } from 'react'
import { DateTime } from 'luxon'

import { SeedSearchParams } from '@/components/ladle'
import { ViewHarness } from '@/views/story-harness'
import { FilterView } from '@/views/FilterView/FilterView'
import { geojsonQuery } from '@/config/api'
import { mockEventSlim } from '@/mocks/events'
import { mockCzechGeojson, mockGeojson } from '@/mocks/regions'
import { refuseGeolocation } from '@/mocks/story-geolocation'

export default { title: 'Views' } satisfies StoryDefault

// Each case is the URL the filters read: every tap writes it, so a case is its query string.
const EXAMPLES = {
  'Nothing picked': '',
  'A pick': 'format=online',
  'No match': 'days=1&time=evening',
  'No single way out': 'days=2&time=evening',
  'Night classes': '',
  'Czech classes': '',
  'Location refused': '',
} as const

type Example = keyof typeof EXAMPLES

// The feed plus an online class at 2 AM, so the filters offer Night.
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
 * the harness seeds. **Czech classes** offers Czech and English with their counts. **Location
 * refused** stands in a browser that refuses the location: press Near me for the message.
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

  useEffect(() => (example === 'Location refused' ? refuseGeolocation() : undefined), [example])

  return (
    <ViewHarness
      path="/filters"
      seed={(client) => {
        if (example === 'Night classes') {
          client.setQueryData(geojsonQuery().queryKey, withNightClass())
        }
        if (example === 'Czech classes')
          client.setQueryData(geojsonQuery().queryKey, mockCzechGeojson)
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
