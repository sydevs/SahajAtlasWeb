import type { Story, StoryDefault } from '@ladle/react'

import { type ReactNode, useEffect } from 'react'
import { DateTime } from 'luxon'
import clsx from 'clsx'

import { StoryAddress, StorySection, StoryWrapper } from '../../ladle'

import { FilterMenus, type FilterMenusProps } from './FilterMenus'

import { refuseGeolocation } from '@/mocks/story-geolocation'

export default { title: 'Organisms' } satisfies StoryDefault

const inAWeek = DateTime.local().plus({ weeks: 1 }).toISODate()
const inAMonth = DateTime.local().plus({ months: 1 }).toISODate()

const LONDON = 'q=London,+UK&center=-0.12,51.5&cc=GB'

/** One live row at its own address: every tap writes that address, and Clear resets it. */
function Example({ path, variant }: { path: string; variant?: FilterMenusProps['variant'] }) {
  return (
    <StoryAddress path={path}>
      <Row variant={variant}>
        <FilterMenus variant={variant} />
      </Row>
    </StoryAddress>
  )
}

const Row = ({ variant, children }: { variant?: string; children: ReactNode }) => (
  <div className={clsx('flex justify-end', variant === 'floating' && 'rounded-lg bg-gray-4 p-4')}>
    {children}
  </div>
)

/**
 * FilterMenus — the filters on a computer: Where, When and Language as buttons, each opening a
 * small menu with the same questions and live counts as the phone's filters (Where's place half is
 * `WhereFilter`). They read and write the URL, and every tap applies at once. The row is
 * right-aligned, and Clear (an ×, named "Clear filters") leads it once anything is chosen, so its
 * arrival moves nothing already there.
 *
 * Each row below sits at its own address, so each is live. A set that matches nothing is not the
 * menus' to explain: the list of classes says so, with the way out (`FilterNotice`).
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
          <Example path="/search?days=2&time=evening" />
          <Example path="/search?days=2&time=evening" variant="floating" />
        </div>
      </StorySection>

      <StorySection
        description="Each button names its question. A place page's Where names the place without filling."
        title="Nothing chosen"
      >
        <div className="flex flex-col gap-4">
          <Example path="/search" />
          <Example path="/gb" />
        </div>
      </StorySection>

      <StorySection
        description="An answered button fills and names its answer. A searched place, Near me or a format fills Where."
        title="One answer each"
      >
        <Example path={`/search?${LONDON}&format=offline&days=2&time=evening&langs=en`} />
      </StorySection>

      <StorySection
        description="Past two answers a button counts them: When counts days, times of day, frequency and dates together."
        title="Everything chosen"
      >
        <Example
          path={`/search?${LONDON}&format=offline&days=1,2,3&time=morning,evening&cadence=WEEKLY&dates=${inAWeek},${inAMonth}&langs=de,en,fr`}
        />
      </StorySection>

      <StorySection
        description="On the calendar Where is only a scope, so it offers no Near me, and shows only where the calendar has a place or mixes online and in-person classes."
        title="On the calendar"
      >
        <Example path="/calendar?region=gb" />
      </StorySection>

      <div />
    </StoryWrapper>
  )
}

Default.storyName = 'Filter Menus'
