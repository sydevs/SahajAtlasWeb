import type { Story, StoryDefault } from '@ladle/react'

import { useState } from 'react'

import { StoryWrapper, StorySection } from '../../ladle'

import { Input } from './Input'

export default {
  title: 'Atoms / Inputs',
} satisfies StoryDefault

/** Input — a native text input on the shared field chrome (the registration form + date bounds). */
export const Default: Story = () => {
  const [value, setValue] = useState('')

  return (
    <StoryWrapper>
      <StorySection description="A plain text input." title="Default">
        <div className="max-w-sm">
          <Input
            placeholder="Your name"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
      </StorySection>

      <StorySection
        description="`highlight` primary-tints an active/used field — the FilterView flags set filters this way."
        title="Highlighted"
      >
        <div className="max-w-sm">
          <Input highlight defaultValue="Berlin" />
        </div>
      </StorySection>

      <StorySection description="`isInvalid` swaps to the danger border." title="Invalid">
        <div className="max-w-sm">
          <Input isInvalid defaultValue="not-an-email" />
        </div>
      </StorySection>

      <StorySection description="Native `type` variants still apply." title="Date">
        <div className="max-w-sm">
          <Input type="date" />
        </div>
      </StorySection>

      <StorySection description="Disabled." title="Disabled">
        <div className="max-w-sm">
          <Input disabled defaultValue="Read only" />
        </div>
      </StorySection>

      <div />
    </StoryWrapper>
  )
}

Default.storyName = 'Input'
