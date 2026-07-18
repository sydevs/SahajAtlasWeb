import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { Summary } from './Summary'

import { CalendarIcon, LocationIcon, CallIcon } from '@/components/atoms/Icons'

export default { title: 'Molecules' } satisfies StoryDefault

/**
 * Summary — a stack of icon + plain-text fact lines, used for the event panel's
 * when/where block. Facts are never actions: nothing looks like a button.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="The event panel's when/where facts." title="Event facts">
      <div className="max-w-md">
        <Summary
          items={[
            { icon: <CalendarIcon size={20} />, text: 'Every Wednesday' },
            { icon: <LocationIcon size={20} />, text: '5 Market St, Cambridge' },
          ]}
        />
      </div>
    </StorySection>

    <StorySection description="Lines wrap; icons stay aligned to the first line." title="Long text">
      <div className="max-w-56">
        <Summary
          items={[
            {
              icon: <CalendarIcon size={20} />,
              text: 'First session: Sat, 2 Jul · 10:30 AM – 12:00 PM (local time)',
            },
            { icon: <CallIcon size={20} />, text: 'Contact host for timings' },
          ]}
        />
      </div>
    </StorySection>

    <StorySection
      description="The compact variant (list card): tighter spacing, text-coloured icons sized to the text."
      title="Compact"
    >
      <div className="max-w-md">
        <Summary
          items={[
            { icon: <CalendarIcon size={16} />, text: 'Every Wednesday · 6:00 PM – 7:30 PM' },
            { icon: <LocationIcon size={16} />, text: '5 Market St, Cambridge' },
          ]}
          variant="compact"
        />
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Summary'
