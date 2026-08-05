import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { LoadMore } from './LoadMore'

import { NEARBY_KM } from '@/lib/shape'

export default { title: 'Organisms' } satisfies StoryDefault

/**
 * LoadMore — the foot of the search results list: the reveal control plus the polite
 * live region that reports the new total. Its sibling DynamicEventsList decides WHICH
 * reveal is on offer (`revealRows`); this only renders it, so it stories offline.
 *
 * The live region is `sr-only` in all three states — the "Revealed" case is here to
 * show that the row collapses to nothing visible once the last press has unmounted the
 * button, rather than leaving a blank strip under the list.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="Rows still to come in the segment on screen — the ordinary paging press."
      title="More to reveal"
    >
      <div className="max-w-md">
        <LoadMore
          announce={false}
          km={NEARBY_KM}
          more="more"
          shown={25}
          total={137}
          onReveal={() => {}}
        />
      </div>
    </StorySection>

    <StorySection
      description="Nearby matches exhausted. The label says plainly what the press does — it is the list's only distance affordance, so it has to read as “nearby events have run out”, not as the list simply ending."
      title="Crossing the distance boundary"
    >
      <div className="max-w-md">
        <LoadMore
          announce
          km={NEARBY_KM}
          more="farther"
          shown={72}
          total={330}
          onReveal={() => {}}
        />
      </div>
    </StorySection>

    <StorySection
      description="Everything revealed: the button is gone and only the (visually hidden) announcement remains, so the row takes no vertical space."
      title="Fully revealed"
    >
      <div className="max-w-md">
        <LoadMore announce km={NEARBY_KM} more={null} shown={330} total={330} onReveal={() => {}} />
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Load More'
