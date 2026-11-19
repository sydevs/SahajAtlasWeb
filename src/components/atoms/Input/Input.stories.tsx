import type { Story, StoryDefault } from '@ladle/react'

import { useState } from 'react'

import { StoryWrapper, StorySection } from '../../ladle'

import { Input } from './Input'

export default {
  title: 'Atoms / Inputs',
} satisfies StoryDefault

/** Input — a native text input on the shared field chrome (the registration form and date bounds).
 *
 *  Every example carries its own `aria-label`: the atom renders a bare `<input>` and takes its
 *  name from the caller, so an unlabelled example would document a field no screen reader can
 *  announce — and the accessibility gate reads these pages (#432). */
export const Default: Story = () => {
  const [value, setValue] = useState('')

  return (
    <StoryWrapper>
      <StorySection description="A plain text input." title="Default">
        <div className="max-w-sm">
          <Input
            aria-label="Your name"
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
          <Input highlight aria-label="City" defaultValue="Berlin" />
        </div>
      </StorySection>

      <StorySection
        description="`isInvalid` swaps to the danger border + sets aria-invalid (pair with an aria-describedby error message)."
        title="Invalid"
      >
        <div className="max-w-sm">
          <Input
            isInvalid
            aria-describedby="email-error"
            aria-label="Email"
            defaultValue="not-an-email"
          />
        </div>
      </StorySection>

      <StorySection description="Native `type` variants still apply." title="Date">
        <div className="max-w-sm">
          <Input aria-label="Start date" type="date" />
        </div>
      </StorySection>

      <StorySection description="Disabled." title="Disabled">
        <div className="max-w-sm">
          <Input disabled aria-label="Read only field" defaultValue="Read only" />
        </div>
      </StorySection>

      <div />
    </StoryWrapper>
  )
}

Default.storyName = 'Input'
