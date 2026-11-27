import type { Story, StoryDefault } from '@ladle/react'

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
 * The LoadMore sections are the foot of the search results list: the reveal
 * control, plus the polite live region that reports the new total.
 * DynamicEventsList decides WHICH reveal is on offer (`revealRows`); LoadMore
 * only renders it. `auto` is off in every case, because armed, the observer
 * would fire the moment the control scrolled into view and the story would
 * re-reveal itself. The button looks identical either way. The live region is
 * `sr-only` in all four states.
 */
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
      title="Load more — more to reveal"
    >
      <div className="max-w-md">
        <LoadMore announce={false} more="more" shown={25} total={137} onReveal={() => {}} />
      </div>
    </StorySection>

    <StorySection
      description="Nearby matches exhausted. The list's only distance affordance, and never auto-fired — reaching past the boundary is a decision, so it has to read as “nearby events have run out” rather than as the list simply ending."
      title="Load more — reaching the distant events"
    >
      <div className="max-w-md">
        <LoadMore announce more="farther" shown={72} total={330} onReveal={() => {}} />
      </div>
    </StorySection>

    <StorySection
      description="Mid-reveal. Nothing is being fetched — every match is already in memory — but a page of cards is real work, so the control spins and stops taking presses until it lands."
      title="Load more — loading"
    >
      <div className="max-w-md">
        <LoadMore announce loading more="more" shown={50} total={137} onReveal={() => {}} />
      </div>
    </StorySection>

    <StorySection
      description="Everything revealed: the button is gone and only the (visually hidden) announcement remains, so the row takes no vertical space and never leaves a blank strip under the list."
      title="Load more — fully revealed"
    >
      <div className="max-w-md">
        <LoadMore announce more={null} shown={330} total={330} onReveal={() => {}} />
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Events List'
