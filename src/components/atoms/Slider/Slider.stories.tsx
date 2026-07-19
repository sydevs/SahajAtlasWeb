import type { Story, StoryDefault } from '@ladle/react'

import { useState } from 'react'

import { StoryWrapper, StorySection } from '../../ladle'

import { Slider } from './Slider'

export default {
  title: 'Atoms',
} satisfies StoryDefault

// Render a 0–24h value as a "9:00 AM – 6:00 PM"-style readout.
const label = (hour: number) => {
  const h = Math.floor(hour)
  const m = hour % 1 ? '30' : '00'
  const suffix = h < 12 ? 'am' : 'pm'
  const twelve = h % 12 === 0 ? 12 : h % 12

  return `${twelve}:${m}${suffix}`
}

/** Slider — a range control (one thumb per value entry) on the brand tokens. */
export const SliderStory: Story = () => {
  const [range, setRange] = useState([9, 18])
  const [single, setSingle] = useState([40])

  return (
    <StoryWrapper>
      <StorySection
        description="Two thumbs over a 0–24h range in 30-minute steps (the time-of-day filter)."
        title="Range (two handles)"
      >
        <div className="flex max-w-sm flex-col gap-2">
          <Slider
            max={24}
            min={0}
            minStepsBetweenThumbs={1}
            step={0.5}
            thumbLabels={['Earliest start time', 'Latest start time']}
            value={range}
            onValueChange={setRange}
          />
          <p className="text-sm text-gray-11">
            {label(range[0])} – {label(range[1])}
          </p>
        </div>
      </StorySection>

      <StorySection description="A single thumb." title="Single value">
        <div className="max-w-sm">
          <Slider thumbLabels="Volume" value={single} onValueChange={setSingle} />
        </div>
      </StorySection>

      <StorySection description="Disabled." title="Disabled">
        <div className="max-w-sm">
          <Slider disabled thumbLabels="Disabled" value={[30]} />
        </div>
      </StorySection>

      <div />
    </StoryWrapper>
  )
}

SliderStory.storyName = 'Slider'
