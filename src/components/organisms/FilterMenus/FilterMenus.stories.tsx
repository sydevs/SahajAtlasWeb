import type { Story, StoryDefault } from '@ladle/react'

import { useEffect, useState } from 'react'
import { DateTime } from 'luxon'
import clsx from 'clsx'

import { StorySection, StoryWrapper } from '../../ladle'

import { FilterMenus, type FilterMenusProps } from './FilterMenus'

import { DEFAULT_FILTERS, type EventFilters } from '@/lib/shape'
import { refuseGeolocation } from '@/mocks/story-geolocation'
import { WhereFilter } from '@/views/Filters/WhereFilter'

export default { title: 'Organisms' } satisfies StoryDefault

const inAWeek = DateTime.local().plus({ weeks: 1 }).toISODate()
const inAMonth = DateTime.local().plus({ months: 1 }).toISODate()

type ExampleProps = {
  initial?: Partial<EventFilters>
  /** The place the Where button names, and whether it counts as an answer. */
  place?: string
  placeAnswered?: boolean
  variant?: FilterMenusProps['variant']
}

/** One live row: every tap edits its own answers, and Clear resets them. */
function Example({ initial, place, placeAnswered = false, variant }: ExampleProps) {
  const [value, setValue] = useState<EventFilters>({ ...DEFAULT_FILTERS, ...initial })

  return (
    <div className={clsx('flex justify-end', variant === 'floating' && 'rounded-lg bg-gray-4 p-4')}>
      <FilterMenus
        value={value}
        variant={variant}
        where={{
          place,
          placeAnswered,
          always: true,
          menu: (facets) => (
            <WhereFilter
              searchable
              counts={facets?.counts.format}
              region={value.region}
              onClear={() => setValue({ ...value, region: null })}
              onPlace={() => {}}
              onSearchInstead={() => {}}
            />
          ),
        }}
        onChange={setValue}
        onClear={() => setValue(DEFAULT_FILTERS)}
      />
    </div>
  )
}

/**
 * FilterMenus — the filters on a computer: Where, When and Language as buttons, each opening a
 * small menu with the same questions and live counts as the phone's filters. Every tap applies at
 * once. The row is right-aligned, and Clear (an ×, named "Clear filters") leads it once anything is
 * chosen, so its arrival moves nothing already there.
 *
 * A set that matches nothing is not the menus' to explain: the list of classes says so, with the
 * way out (`FilterNotice`).
 *
 * The browser here refuses the visitor's location, so Near me in any Where menu shows what it says
 * then.
 */
export const Default: Story = () => {
  useEffect(refuseGeolocation, [])

  return (
    <StoryWrapper>
      <StorySection
        description="Inline (the default): smaller bordered buttons in a view's toolbar, as in the full-width calendar. Floating: buttons lifted off the map, beside its own controls."
        title="Variants"
      >
        <div className="flex flex-col gap-4">
          <Example initial={{ daysOfWeek: [2], timeOfDay: ['evening'] }} />
          <Example initial={{ daysOfWeek: [2], timeOfDay: ['evening'] }} variant="floating" />
        </div>
      </StorySection>

      <StorySection
        description="Each button names its question. A place page's Where names the place without filling."
        title="Nothing chosen"
      >
        <div className="flex flex-col gap-4">
          <Example />
          <Example initial={{ region: 'gb' }} place="United Kingdom" />
        </div>
      </StorySection>

      <StorySection
        description="An answered button fills and names its answer. A searched place, Near me or a format fills Where."
        title="One answer each"
      >
        <Example
          initial={{
            format: 'offline',
            daysOfWeek: [2],
            timeOfDay: ['evening'],
            languages: ['en'],
          }}
          place="London"
          placeAnswered={true}
        />
      </StorySection>

      <StorySection
        description="Past two answers a button counts them: When counts days, times of day, frequency and dates together."
        title="Everything chosen"
      >
        <Example
          initial={{
            format: 'offline',
            daysOfWeek: [1, 2, 3],
            timeOfDay: ['morning', 'evening'],
            cadence: 'WEEKLY',
            dateRange: { start: inAWeek, end: inAMonth },
            languages: ['de', 'en', 'fr'],
          }}
          place="London"
          placeAnswered={true}
        />
      </StorySection>

      <div />
    </StoryWrapper>
  )
}

Default.storyName = 'Filter Menus'
