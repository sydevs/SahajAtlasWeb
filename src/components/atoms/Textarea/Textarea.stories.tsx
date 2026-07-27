import type { Story, StoryDefault } from '@ladle/react'

import { useState } from 'react'

import { StoryWrapper, StorySection } from '../../ladle'

import { Textarea } from './Textarea'

export default {
  title: 'Atoms / Inputs',
} satisfies StoryDefault

/** Textarea — the multiline sibling of Input, sharing one field-chrome recipe. */
export const Default: Story = () => {
  const [value, setValue] = useState('')

  return (
    <StoryWrapper>
      <StorySection description="A plain multiline input." title="Default">
        <div className="max-w-sm">
          <Textarea
            placeholder="Anything you'd like us to know?"
            rows={4}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
      </StorySection>

      <StorySection
        description="`highlight` primary-tints an active/used field."
        title="Highlighted"
      >
        <div className="max-w-sm">
          <Textarea highlight defaultValue="A note that's been filled in." rows={4} />
        </div>
      </StorySection>

      <StorySection description="`isInvalid` swaps to the danger border." title="Invalid">
        <div className="max-w-sm">
          <Textarea isInvalid defaultValue="Too short" rows={4} />
        </div>
      </StorySection>

      <StorySection description="Disabled." title="Disabled">
        <div className="max-w-sm">
          <Textarea disabled defaultValue="Read only" rows={4} />
        </div>
      </StorySection>

      <div />
    </StoryWrapper>
  )
}

Default.storyName = 'Textarea'
