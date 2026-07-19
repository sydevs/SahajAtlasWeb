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

      <StorySection
        description="`isInvalid` is the registration form's error affordance (paired there with aria-invalid + aria-describedby); `disabled` dims the trigger and blocks it; with no value the placeholder shows."
        title="States"
      >
        <div className="flex max-w-md flex-col gap-3">
          <Select isInvalid aria-label="Invalid" value={value} onValueChange={setValue}>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </Select>
          <Select disabled aria-label="Disabled" value={value} onValueChange={setValue}>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </Select>
          <Select aria-label="Empty" placeholder="Choose a time…">
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
