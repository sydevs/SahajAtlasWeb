import type { Story, StoryDefault } from '@ladle/react'

import { StorySection, StoryWrapper } from '../../ladle'

import { SortMenu } from './SortMenu'

export default { title: 'Molecules' } satisfies StoryDefault

/**
 * SortMenu — the results-list sort selector. The trigger shows `Sort: <current>`; open
 * it to pick Recommended / Closest / Soonest (a checkmark marks the active one). The
 * selection persists in `?sort=` on the story's in-memory router, so the trigger label
 * updates as you choose. Built on Radix DropdownMenu (RadioGroup + ItemIndicator), so
 * the panel portals to the theme root — open it to inspect.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="A ghost trigger with the current ordering and a caret. Opening it reveals the three orderings as a radio group with a checkmark on the active one."
      title="Sort menu"
    >
      <SortMenu />
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Sort Menu'
