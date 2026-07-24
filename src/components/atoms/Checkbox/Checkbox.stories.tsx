import type { Story, StoryDefault } from '@ladle/react'

import { useState } from 'react'

import { StoryWrapper, StorySection } from '../../ladle'

import { Checkbox } from './Checkbox'

export default {
  title: 'Atoms',
} satisfies StoryDefault

/** Checkbox — one Radix control with a `switch` or `checkbox` appearance. */
export const Default: Story = () => {
  const [a, setA] = useState(true)
  const [b, setB] = useState(false)
  const [c, setC] = useState(false)

  return (
    <StoryWrapper>
      <StorySection description="Colour × on/off (default appearance)." title="Switch">
        <div className="flex flex-wrap items-center gap-6">
          <Checkbox checked color="primary" />
          <Checkbox checked color="secondary" />
          <Checkbox checked color="neutral" />
          <Checkbox checked={false} color="primary" />
        </div>
      </StorySection>

      <StorySection description="Square box with a check indicator." title="Checkbox appearance">
        <div className="flex flex-wrap items-center gap-6">
          <Checkbox checked appearance="checkbox" color="primary" />
          <Checkbox checked appearance="checkbox" color="secondary" />
          <Checkbox checked appearance="checkbox" color="neutral" />
          <Checkbox appearance="checkbox" checked={false} color="primary" />
        </div>
      </StorySection>

      <StorySection title="With label (controlled)">
        <div className="flex flex-col gap-3">
          <Checkbox checked={a} color="primary" onCheckedChange={setA}>
            Show online classes
          </Checkbox>
          <Checkbox checked={b} color="secondary" size="sm" onCheckedChange={setB}>
            Compact, secondary
          </Checkbox>
          <Checkbox appearance="checkbox" checked={c} color="primary" onCheckedChange={setC}>
            Keep me informed about upcoming events and news
          </Checkbox>
        </div>
      </StorySection>

      <div />
    </StoryWrapper>
  )
}

Default.storyName = 'Checkbox'
