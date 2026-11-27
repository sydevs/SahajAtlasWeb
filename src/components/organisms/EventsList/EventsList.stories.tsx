import type { Story, StoryDefault } from '@ladle/react'
import type { ReactNode } from 'react'

import { StoryWrapper, StorySection } from '../../ladle'

import { EventsList } from './EventsList'
import { LoadMore } from './LoadMore'

import { mockEventSlim, mockEventSlimList } from '@/mocks/events'

export default { title: 'Organisms' } satisfies StoryDefault

/**
 * EventsList is the presentational list of events: events pass in via props.
 * Its sibling DynamicEventsList fetches by coordinates over the network, so
 * this file does not story that part. These stories stay offline.
 *
 * The search results list ends in LoadMore, its reveal control plus the polite
 * live region that reports the new total, so the paging sections show the two
 * together, as DynamicEventsList composes them. DynamicEventsList decides WHICH
 * reveal is on offer (`revealRows`); LoadMore only renders it. `auto` is off in every case, because armed, the observer
 * would fire the moment the control scrolled into view and the story would
 * re-reveal itself. The button looks identical either way. The live region is
 * `sr-only` in all four states.
 */
// The first rows of a long list, over the foot DynamicEventsList puts under it.
function PagedList({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-md">
      <EventsList events={mockEventSlimList.slice(0, 3)} />
      {children}
    </div>
  )
}

export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="The full list with mixed online / in-person events." title="Default">
      <div className="max-w-md">
        <EventsList events={mockEventSlimList} />
      </div>
    </StorySection>

    <StorySection description="A single event." title="Single">
      <div className="max-w-md">
        <EventsList events={[mockEventSlim]} />
      </div>
    </StorySection>

    <StorySection description="No events to show." title="Empty">
      <div className="max-w-md">
        <EventsList events={[]} />
      </div>
    </StorySection>

    <StorySection
      description="Rows still to come in the segment on screen — the ordinary paging press, and the one the list also fires automatically as the reader reaches it."
      title="Paging — more to reveal"
    >
      <PagedList>
        <LoadMore announce={false} more="more" shown={25} total={137} onReveal={() => {}} />
      </PagedList>
    </StorySection>

    <StorySection
      description="Nearby matches exhausted. The list's only distance affordance, and never auto-fired — reaching past the boundary is a decision, so it has to read as “nearby events have run out” rather than as the list simply ending."
      title="Paging — reaching the distant events"
    >
      <PagedList>
        <LoadMore announce more="farther" shown={72} total={330} onReveal={() => {}} />
      </PagedList>
    </StorySection>

    <StorySection
      description="Mid-reveal. Nothing is being fetched — every match is already in memory — but a page of cards is real work, so the control spins and stops taking presses until it lands."
      title="Paging — loading"
    >
      <PagedList>
        <LoadMore announce loading more="more" shown={50} total={137} onReveal={() => {}} />
      </PagedList>
    </StorySection>

    <StorySection
      description="Everything revealed: the button is gone and only the (visually hidden) announcement remains, so the row takes no vertical space and never leaves a blank strip under the list."
      title="Paging — fully revealed"
    >
      <PagedList>
        <LoadMore announce more={null} shown={330} total={330} onReveal={() => {}} />
      </PagedList>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Events List'
