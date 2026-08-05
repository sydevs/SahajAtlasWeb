import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { LoadMore } from './LoadMore'

export default { title: 'Organisms' } satisfies StoryDefault

/**
 * LoadMore — the foot of the search results list: the reveal control plus the polite
 * live region that reports the new total. Its sibling DynamicEventsList decides WHICH
 * reveal is on offer (`revealRows`); this only renders it, so it stories offline.
 *
 * `auto` is deliberately off in every case here: armed, the observer would fire the
 * moment the control scrolled into view and the story would re-reveal itself on sight.
 * The button is identical either way — auto-reveal only adds an IntersectionObserver
 * beside it, never a different control — so these cases cover its whole visual surface.
 *
 * The live region is `sr-only` in all three states; the "Fully revealed" case is here
 * to show that the row collapses to nothing visible once the last press has unmounted
 * the button, rather than leaving a blank strip under the list.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="Rows still to come in the segment on screen — the ordinary paging press, and the one the list also fires automatically as the reader reaches it."
      title="More to reveal"
    >
      <div className="max-w-md">
        <LoadMore announce={false} more="more" shown={25} total={137} onReveal={() => {}} />
      </div>
    </StorySection>

    <StorySection
      description="Nearby matches exhausted. The list's only distance affordance, and never auto-fired — reaching past the boundary is a decision, so it has to read as “nearby events have run out” rather than as the list simply ending."
      title="Reaching the distant events"
    >
      <div className="max-w-md">
        <LoadMore announce more="farther" shown={72} total={330} onReveal={() => {}} />
      </div>
    </StorySection>

    <StorySection
      description="Everything revealed: the button is gone and only the (visually hidden) announcement remains, so the row takes no vertical space."
      title="Fully revealed"
    >
      <div className="max-w-md">
        <LoadMore announce more={null} shown={330} total={330} onReveal={() => {}} />
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Load More'
