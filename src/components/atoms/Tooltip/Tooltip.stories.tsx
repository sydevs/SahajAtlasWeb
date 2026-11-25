import type { Story, StoryDefault } from '@ladle/react'

import { LocateFixed } from 'lucide-react'

import { StoryWrapper, StorySection } from '../../ladle'
import { Button } from '../Button'

import { Tooltip } from './Tooltip'

export default { title: 'Atoms' } satisfies StoryDefault

/**
 * Tooltip — a short label beside a control, on hover and on keyboard focus, never on touch. It
 * carries the skin of the map's opened credits panel, so the labels beside the map's controls
 * match it. Hover the button, or Tab to it.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="The label is the control's accessible name, shown. `side` defaults to `left`, for the map's right-hand column."
      title="Sides"
    >
      <div className="flex items-center justify-center gap-10 py-12">
        {(['left', 'top', 'bottom', 'right'] as const).map((side) => (
          <Tooltip key={side} label={`Find my location (${side})`} side={side}>
            <Button
              isIconOnly
              aria-label={`Find my location (${side})`}
              radius="full"
              variant="floating"
            >
              <LocateFixed size={20} />
            </Button>
          </Tooltip>
        ))}
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)
Default.storyName = 'Tooltip'
