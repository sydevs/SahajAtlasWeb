import type { Story, StoryDefault } from '@ladle/react'

import { LocateFixed } from 'lucide-react'

import { StoryWrapper, StorySection } from '../../ladle'
import { Button } from '../Button'

import { HoverLabel } from './HoverLabel'

export default { title: 'Atoms' } satisfies StoryDefault

/**
 * HoverLabel — a control's name drawn out of its end as one pill, on mouse hover and on keyboard
 * focus, never on touch. It is the shape of Mapbox's credits button when opened, so the map's
 * controls and the credits beside them read as one family. Hover the button, or Tab to it.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="The label is the control's accessible name, shown. It opens leftward, for the map's right-hand column."
      title="Floating control"
    >
      <div className="flex justify-end py-6 pe-6">
        <HoverLabel text="Find my location">
          <Button isIconOnly aria-label="Find my location" radius="full" variant="floating">
            <LocateFixed size={20} />
          </Button>
        </HoverLabel>
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)
Default.storyName = 'Hover Label'
