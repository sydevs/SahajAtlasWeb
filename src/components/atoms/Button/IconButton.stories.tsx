import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { IconButton } from './IconButton'

import { CloseIcon, ListIcon, FilterIcon } from '@/components/atoms/Icons'

export default {
  title: 'Atoms',
} satisfies StoryDefault

/** IconButton — the shared chrome for the drawer header's icon-buttons. */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="Subtle by default, full-contrast on hover — close, list-toggle, and filter render identically side by side."
      title="Header icon-buttons"
    >
      <div className="flex items-center gap-2">
        <IconButton aria-label="Filter">
          <FilterIcon size={20} />
        </IconButton>
        <IconButton aria-label="Explore">
          <ListIcon size={24} />
        </IconButton>
        <IconButton aria-label="Close">
          <CloseIcon size={20} />
        </IconButton>
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'IconButton'
