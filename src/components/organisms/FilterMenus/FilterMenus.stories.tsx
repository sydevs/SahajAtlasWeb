import type { Story, StoryDefault } from '@ladle/react'

import { useEffect, useMemo } from 'react'
import { DateTime } from 'luxon'

import { SeedSearchParams } from '@/components/ladle'
import { refuseGeolocation } from '@/mocks/story-geolocation'
import { FilterMenuBar } from '@/views/FilterView/FilterMenuBar'
import { ViewHarness } from '@/views/story-harness'

export default { title: 'Organisms' } satisfies StoryDefault

const inAWeek = DateTime.local().plus({ weeks: 1 }).toISODate()
const inAMonth = DateTime.local().plus({ months: 1 }).toISODate()

// Each case is the URL the buttons read: every tap writes it, so a case is its query string.
const EXAMPLES = {
  'Nothing chosen': '',
  'One answer each': 'format=online&days=2&time=evening&langs=en',
  'Everything chosen': `q=London,+UK&center=-0.1276,51.5072&format=offline&days=1,2,3&time=morning,evening&cadence=WEEKLY&dates=${inAWeek},${inAMonth}&langs=de,en,fr`,
  'Nothing matches': 'days=1&time=evening',
  'Nothing matches, no single way out': 'days=2&time=evening',
  'Location refused': '',
} as const

type Example = keyof typeof EXAMPLES

type Placement = 'map' | 'toolbar'

/**
 * FilterMenus — the filters on a computer: Where, When and Language as buttons, each opening a
 * small menu with the same questions and live counts as the phone's filters. Every tap applies at
 * once.
 *
 * **Placement** is a parameter, not an override: `map` is the floating buttons beside the map's own
 * controls; `toolbar` is the smaller bordered buttons in the full-width calendar's toolbar. Either
 * way the row is right-aligned and Clear (an ×, named "Clear filters") leads it once anything is
 * chosen.
 *
 * **A button's state** follows its answers. Unanswered, it names its question. Answered, it fills
 * and names the answer ("Tue · Evening"); past two answers it counts them ("5 timings",
 * "3 languages"). Where names a place page without filling, and fills for a searched place, Near
 * me or a format.
 *
 * **When nothing matches**, every menu ends the same way, whichever one is open: "No classes
 * match", then the one removal that brings the most classes back, wherever that answer lives. So
 * the Language menu can offer "Remove In person". Where no single removal brings any back, only
 * the line shows, and Clear is the way out.
 *
 * - **Everything chosen**: every button filled, When and Language counted.
 * - **Nothing matches**: open any menu for the line and its one removal.
 * - **Nothing matches, no single way out**: the line alone.
 * - **Location refused**: this browser refuses the location. Press Where, then Near me, for the
 *   message and its way on to the search box.
 */
export const FilterMenusStory: Story<{ example: Example; placement: Placement }> = ({
  example,
  placement,
}) => {
  // Stable per case, so `SeedSearchParams` seeds once rather than on every render.
  const params = useMemo(() => new URLSearchParams(EXAMPLES[example]), [example])

  useEffect(() => (example === 'Location refused' ? refuseGeolocation() : undefined), [example])

  return (
    <ViewHarness path="/search" seedKey={`filter-menus-${example}`}>
      <SeedSearchParams params={params}>
        {/* The floating buttons are drawn over the map, so the story gives them a surface. */}
        <div
          className={
            placement === 'map'
              ? 'flex justify-end bg-gray-4 p-4'
              : 'flex justify-end border-b border-divider p-4'
          }
        >
          <FilterMenuBar placement={placement} />
        </div>
      </SeedSearchParams>
    </ViewHarness>
  )
}

FilterMenusStory.storyName = 'Filter menus'
FilterMenusStory.argTypes = {
  placement: {
    name: 'Placement',
    options: ['map', 'toolbar'],
    control: { type: 'radio' },
    defaultValue: 'map',
  },
  example: {
    name: 'Example',
    options: Object.keys(EXAMPLES),
    control: { type: 'radio' },
    defaultValue: 'Nothing chosen',
  },
}
