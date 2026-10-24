import type { Story, StoryDefault } from '@ladle/react'

import { StorySection, StoryWrapper } from '../../ladle'

import { AddClassLink } from './AddClassLink'

import { List, ListItem } from '@/components/molecules'

export default { title: 'Molecules' } satisfies StoryDefault

/**
 * AddClassLink is the foot-of-list entry to the add-a-class flow. Under the results and the
 * country index it opens `/add` with no place in context; under a region it opens that
 * region's own `/add`, so the address search starts near it.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection title="Variants">
      <StorySection title="No place in context" variant="subsection">
        <AddClassLink href="#" label="Don't see your class? Add it" />
      </StorySection>
      <StorySection title="Under a region" variant="subsection">
        <AddClassLink href="#" label="Add a class here" />
      </StorySection>
    </StorySection>

    <StorySection inContext title="Examples">
      <div className="max-w-sm rounded-lg border border-divider">
        <List>
          <ListItem count={12} href="#" label="Belgium" />
          <ListItem count={4} href="#" label="Netherlands" />
        </List>
        <AddClassLink href="#" label="Don't see your class? Add it" />
      </div>
    </StorySection>
    <div />
  </StoryWrapper>
)
Default.storyName = 'Add Class Link'
