import type { Story, StoryDefault } from '@ladle/react'

import { Calendar, Video } from 'lucide-react'

import { StoryWrapper, StorySection } from '../../ladle'

import { Chip } from './Chip'

export default {
  title: 'Atoms',
} satisfies StoryDefault

const colors = ['primary', 'secondary', 'contrast', 'neutral'] as const

/**
 * Chip — a compact, sentence-case pill on the Radix-semantic tokens. This story
 * shows the colours, sizes, and removable
 * options.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="One style. Neutral is the norm; a colour is for the chip that must stand out."
      title="Colour"
    >
      <div className="flex flex-wrap items-center gap-2">
        {colors.map((color) => (
          <Chip key={color} color={color}>
            {color}
          </Chip>
        ))}
      </div>
    </StorySection>

    <StorySection description="sm (default) and md, across every colour." title="Size">
      <div className="flex flex-col gap-3">
        {(['sm', 'md'] as const).map((size) => (
          <div key={size} className="flex flex-wrap items-center gap-2">
            {colors.map((color) => (
              <Chip key={color} color={color} size={size}>
                {size}
              </Chip>
            ))}
          </div>
        ))}
      </div>
    </StorySection>

    <StorySection
      description="`onClose` adds a trailing remove button — as the active-filter pills use. Shown on every colour."
      title="Removable"
    >
      <div className="flex flex-wrap items-center gap-2">
        {colors.map((color) => (
          <Chip key={color} closeLabel={`Remove ${color}`} color={color} onClose={() => {}}>
            {color}
          </Chip>
        ))}
      </div>
    </StorySection>

    <StorySection description="A leading icon slot, across every colour." title="With icon">
      <div className="flex flex-wrap items-center gap-2">
        {colors.map((color) => (
          <Chip key={color} color={color} icon={<Calendar size={14} />}>
            {color}
          </Chip>
        ))}
      </div>
    </StorySection>

    <StorySection inContext={true} title="Examples">
      <div className="flex flex-wrap items-center gap-1">
        <Chip color="primary" icon={<Calendar size={14} />}>
          weekly
        </Chip>
        <Chip color="secondary">Français</Chip>
        <Chip color="contrast">Today</Chip>
        <Chip color="neutral" icon={<Video size={14} />}>
          online
        </Chip>
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Chip'
