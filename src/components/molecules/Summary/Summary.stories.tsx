import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { Summary } from './Summary'

import { CalendarIcon, LocationIcon, MonitorIcon } from '@/components/atoms/Icons'

export default { title: 'Molecules' } satisfies StoryDefault

/**
 * Summary — a stack of icon + plain-text fact lines. Each item is an icon
 * component, a required primary `text`, and an optional faded `subtext`. Facts
 * are never actions: nothing looks like a button. Summary owns the icon
 * sizing/colour per variant.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="The event panel's when/where facts." title="Event facts">
      <div className="max-w-md">
        <Summary
          items={[
            {
              icon: CalendarIcon,
              text: 'Every Wednesday · 6:00 PM – 7:30 PM',
              subtext: 'Next session: Wed, 22 Jul',
            },
            { icon: LocationIcon, text: '5 Market St, Cambridge' },
          ]}
        />
      </div>
    </StorySection>

    <StorySection
      description="Online — the where line carries a faded time conversion."
      title="Online"
    >
      <div className="max-w-md">
        <Summary
          items={[
            {
              icon: CalendarIcon,
              text: 'Every Wednesday · 7:00 PM',
              subtext: 'Next session: Wed, 22 Jul',
            },
            { icon: MonitorIcon, text: 'Hosted from Prague', subtext: 'Thu, 4:00 AM' },
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
            {
              icon: CalendarIcon,
              text: 'Every Wednesday · 6:00 PM',
              subtext: 'Next session: Wed, 22 Jul',
            },
            { icon: LocationIcon, text: '5 Market St, Cambridge' },
          ]}
          variant="compact"
        />
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Summary'
