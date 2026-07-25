import type { Story, StoryDefault } from '@ladle/react'

import {
  StoryWrapper,
  StorySection,
  StoryGrid,
  StoryGridHeader,
  StoryGridHeaderRow,
  StoryGridHeaderCell,
  StoryGridBody,
  StoryGridRow,
  StoryGridCell,
} from '../../ladle'

import { Chip } from './Chip'

import { EventIcon, OnlineCallIcon } from '@/components/atoms/Icons'

export default {
  title: 'Atoms',
} satisfies StoryDefault

const colors = ['primary', 'secondary', 'contrast', 'neutral'] as const

/**
 * Chip — a compact, uppercase label on the Radix-semantic tokens. Showcases the
 * colour × variant matrix and the size / radius / removable options.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="Colour (ramp) × variant (surface treatment)."
      title="Colour × variant"
    >
      <StoryGrid>
        <StoryGridHeader>
          <StoryGridHeaderRow>
            <StoryGridHeaderCell />
            <StoryGridHeaderCell>flat</StoryGridHeaderCell>
            <StoryGridHeaderCell>subtle</StoryGridHeaderCell>
            <StoryGridHeaderCell>ghost</StoryGridHeaderCell>
          </StoryGridHeaderRow>
        </StoryGridHeader>
        <StoryGridBody>
          {colors.map((color) => (
            <StoryGridRow key={color}>
              <StoryGridCell isLabel>{color}</StoryGridCell>
              <StoryGridCell>
                <Chip color={color} variant="flat">
                  online
                </Chip>
              </StoryGridCell>
              <StoryGridCell>
                <Chip color={color} variant="subtle">
                  online
                </Chip>
              </StoryGridCell>
              <StoryGridCell>
                <Chip color={color} variant="ghost">
                  online
                </Chip>
              </StoryGridCell>
            </StoryGridRow>
          ))}
        </StoryGridBody>
      </StoryGrid>
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
      description="Square (sm, default) vs pill (full) corners, across every colour."
      title="Radius"
    >
      <div className="flex flex-col gap-3">
        {(['sm', 'full'] as const).map((radius) => (
          <div key={radius} className="flex flex-wrap items-center gap-2">
            {colors.map((color) => (
              <Chip key={color} color={color} radius={radius}>
                {radius === 'sm' ? 'square' : 'pill'}
              </Chip>
            ))}
          </div>
        ))}
      </div>
    </StorySection>

    <StorySection
      description="`onClose` adds a trailing remove button — pairs with `radius=full` for the active-filter pills. Shown on every colour."
      title="Removable"
    >
      <div className="flex flex-wrap items-center gap-2">
        {colors.map((color) => (
          <Chip
            key={color}
            closeLabel={`Remove ${color}`}
            color={color}
            radius="full"
            onClose={() => {}}
          >
            {color}
          </Chip>
        ))}
      </div>
    </StorySection>

    <StorySection description="A leading icon slot, across every colour." title="With icon">
      <div className="flex flex-wrap items-center gap-2">
        {colors.map((color) => (
          <Chip key={color} color={color} icon={<EventIcon size={14} />}>
            {color}
          </Chip>
        ))}
      </div>
    </StorySection>

    <StorySection inContext={true} title="Examples">
      <div className="flex flex-wrap items-center gap-1">
        <Chip color="primary" icon={<EventIcon size={14} />}>
          weekly
        </Chip>
        <Chip color="secondary">Français</Chip>
        <Chip color="contrast">Today</Chip>
        <Chip color="neutral" icon={<OnlineCallIcon size={14} />}>
          online
        </Chip>
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Chip'
