import type { Story, StoryDefault } from '@ladle/react'

import { useEffect } from 'react'

import { StoryAddress, StorySection, StoryWrapper } from '../../ladle'

import { WhereFilter, type WhereFilterProps } from './WhereFilter'

import { refuseGeolocation } from '@/mocks/story-geolocation'

export default { title: 'Organisms' } satisfies StoryDefault

const noop = () => {}

/** One Where group at its own address, which names the place a search put in scope. */
function Example({ path, ...props }: Partial<WhereFilterProps> & { path: string }) {
  return (
    <StoryAddress path={path}>
      <div className="max-w-[320px]">
        <WhereFilter
          searchable
          region={null}
          onClear={noop}
          onPlace={noop}
          onSearchInstead={noop}
          {...props}
        />
      </div>
    </StoryAddress>
  )
}

/**
 * WhereFilter — the Where question, the same in the phone's filters and in the Where menu on a
 * computer: Near me, and the place in scope as a removable tag. There is no town field; the list's
 * own search box is the one place to type a town.
 *
 * The browser here refuses the visitor's location, so pressing Near me shows what it says then.
 */
export const Default: Story = () => {
  useEffect(refuseGeolocation, [])

  return (
    <StoryWrapper>
      <StorySection description="Nothing in scope: Near me alone." title="Everywhere">
        <Example path="/search" />
      </StorySection>

      <StorySection
        description="A place page or a region filter: its name, removable."
        title="A place"
      >
        <Example path="/search?region=gb" region="gb" />
      </StorySection>

      <StorySection
        description="A searched town, with what its area holds, so 'near' never claims more than it has."
        title="A searched place"
      >
        <Example
          counts={{ offline: 12, online: 31 }}
          path="/search?q=London,+UK&center=-0.12,51.5&cc=GB"
        />
      </StorySection>

      <StorySection
        description="The calendar does not rank by place, so there is no Near me, only the place in scope."
        title="On the calendar"
      >
        <Example path="/calendar?region=gb" region="gb" searchable={false} />
      </StorySection>
      <div />
    </StoryWrapper>
  )
}

Default.storyName = 'Where Filter'
