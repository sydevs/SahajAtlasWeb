import type { Story, StoryDefault } from '@ladle/react'

import { useState } from 'react'

import { StoryWrapper, StorySection } from '../../ladle'

import { ToggleGroup, ToggleGroupItem } from './ToggleGroup'

export default {
  title: 'Atoms',
} satisfies StoryDefault

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** ToggleGroup — pill-style single- or multi-select (format, day-of-week filters). */
export const ToggleGroupStory: Story = () => {
  const [format, setFormat] = useState('any')
  const [days, setDays] = useState<string[]>(['1', '3'])

  return (
    <StoryWrapper>
      <StorySection description="One choice at a time (the Format filter)." title="Single-select">
        <ToggleGroup ariaLabel="Format" type="single" value={format} onValueChange={setFormat}>
          <ToggleGroupItem value="any">Any</ToggleGroupItem>
          <ToggleGroupItem value="offline">In person</ToggleGroupItem>
          <ToggleGroupItem value="online">Online</ToggleGroupItem>
        </ToggleGroup>
      </StorySection>

      <StorySection description="Multiple choices (the Day-of-week filter)." title="Multi-select">
        <ToggleGroup ariaLabel="Days" type="multiple" value={days} onValueChange={setDays}>
          {WEEKDAYS.map((day, index) => (
            <ToggleGroupItem key={index} value={String(index + 1)}>
              {day}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </StorySection>

      <div />
    </StoryWrapper>
  )
}

ToggleGroupStory.storyName = 'ToggleGroup'
