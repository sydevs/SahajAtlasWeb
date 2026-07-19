import type { Story, StoryDefault } from '@ladle/react'

import { useState } from 'react'

import { StoryWrapper, StorySection } from '../../ladle'

import { Select, SelectItem } from './Select'

export default {
  title: 'Atoms',
} satisfies StoryDefault

const options = [
  { value: 'sat', label: 'Saturday morning' },
  { value: 'sun', label: 'Sunday evening' },
  { value: 'wed', label: 'Wednesday evening' },
]

/** Select — a Radix select whose listbox portals into the themed widget root. */
export const Default: Story = () => {
  const [value, setValue] = useState('sat')

  return (
    <StoryWrapper>
      <StorySection
        description="Controlled value; listbox portals into the theme root."
        title="Select"
      >
        <div className="max-w-xs">
          <Select aria-label="Class time" value={value} onValueChange={setValue}>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </Select>
        </div>
      </StorySection>

      <div />
    </StoryWrapper>
  )
}

Default.storyName = 'Select'
