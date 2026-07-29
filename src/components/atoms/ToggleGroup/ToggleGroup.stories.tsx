import type { Story, StoryDefault } from '@ladle/react'

import { useState } from 'react'

import { StoryWrapper, StorySection } from '../../ladle'

import { ToggleGroup, ToggleGroupItem } from './ToggleGroup'

export default {
  title: 'Atoms / Inputs',
} satisfies StoryDefault

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** ToggleGroup — single- or multi-select; separate pills or a joined segmented bar. */
export const Default: Story = () => {
  const [format, setFormat] = useState('any')
  const [days, setDays] = useState<string[]>(['1', '3'])

  return (
    <StoryWrapper>
      <StorySection
        description="Single-select as a joined segmented control (the Format/Frequency filters)."
        title="Joined (single-select)"
      >
        <div className="max-w-xs">
          <ToggleGroup
            joined
            aria-label="Format"
            type="single"
            value={format}
            onValueChange={setFormat}
          >
            <ToggleGroupItem value="any">Any</ToggleGroupItem>
            <ToggleGroupItem value="offline">In person</ToggleGroupItem>
            <ToggleGroupItem value="online">Online</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </StorySection>

      <StorySection
        description="Multiple choices as separate pills (the Day-of-week filter)."
        title="Multi-select"
      >
        <ToggleGroup aria-label="Days" type="multiple" value={days} onValueChange={setDays}>
          {WEEKDAYS.map((day, index) => (
            <ToggleGroupItem key={index} value={String(index + 1)}>
              {day}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </StorySection>

      <StorySection
        description="`highlight` wraps the group in a primary tint to flag an active/used filter."
        title="Highlighted"
      >
        <ToggleGroup
          highlight
          aria-label="Days (active)"
          type="multiple"
          value={days}
          onValueChange={setDays}
        >
          {WEEKDAYS.map((day, index) => (
            <ToggleGroupItem key={index} value={String(index + 1)}>
              {day}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </StorySection>

      <StorySection
        description="`isInvalid` danger-borders the items + sets aria-invalid on the group. Pair with an aria-describedby error message."
        title="Invalid"
      >
        <ToggleGroup
          isInvalid
          aria-describedby="days-error"
          aria-label="Days (error)"
          type="multiple"
          value={days}
          onValueChange={setDays}
        >
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

Default.storyName = 'ToggleGroup'
