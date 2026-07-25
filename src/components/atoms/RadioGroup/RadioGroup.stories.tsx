import type { Story, StoryDefault } from '@ladle/react'

import { useState } from 'react'

import { StoryWrapper, StorySection } from '../../ladle'

import { RadioGroup, type RadioOption } from './RadioGroup'

export default { title: 'Atoms' } satisfies StoryDefault

const options: RadioOption[] = [
  { value: 'a', label: 'This week — Wed, Jul 29' },
  { value: 'b', label: 'Next week — Wed, Aug 5' },
  { value: 'c', label: 'In 2 weeks — Wed, Aug 12' },
  { value: 'd', label: 'In 3 weeks — Wed, Aug 19' },
  { value: 'e', label: 'In 4 weeks — Wed, Aug 26' },
]

/**
 * RadioGroup — a controlled radio list rendered as selectable cards. The chosen
 * card is highlighted; `collapseAfter` hides the tail behind a reveal link so a
 * long list (e.g. the registration date picker) doesn't flood the form.
 */
export const Default: Story = () => {
  const [simple, setSimple] = useState('a')
  const [collapsed, setCollapsed] = useState('a')

  return (
    <StoryWrapper>
      <StorySection
        description="A controlled radio list; the selected card is highlighted."
        title="Radio list"
      >
        <div className="max-w-sm">
          <RadioGroup
            aria-label="Pick one"
            name="simple"
            options={options.slice(0, 3)}
            value={simple}
            onChange={setSimple}
          />
        </div>
      </StorySection>

      <StorySection
        description="`collapseAfter` shows the first N options with a reveal link for the rest."
        title="Collapsible"
      >
        <div className="max-w-sm">
          <RadioGroup
            aria-label="Pick a date"
            collapseAfter={3}
            moreLabel="Show more dates"
            name="collapsed"
            options={options}
            value={collapsed}
            onChange={setCollapsed}
          />
        </div>
      </StorySection>

      <div />
    </StoryWrapper>
  )
}

Default.storyName = 'Radio Group'
