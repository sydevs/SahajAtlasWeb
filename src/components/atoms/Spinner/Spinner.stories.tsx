import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { Spinner } from './Spinner'

export default {
  title: 'Atoms',
} satisfies StoryDefault

const colors = ['primary', 'secondary', 'contrast', 'neutral'] as const
const sizes = ['sm', 'md', 'lg'] as const

/** Spinner — a pure-CSS loading indicator on the brand/neutral tokens. */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="Colour × size." title="Variants">
      <div className="flex flex-wrap items-end gap-8">
        {colors.map((color) =>
          sizes.map((size) => <Spinner key={`${color}-${size}`} color={color} size={size} />),
        )}
      </div>
    </StorySection>

    <StorySection title="With label">
      <Spinner color="secondary" label="Loading…" />
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Spinner'
