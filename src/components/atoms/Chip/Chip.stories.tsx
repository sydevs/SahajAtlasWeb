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

const colors = ['primary', 'secondary', 'default'] as const

/**
 * Chip — a compact, uppercase label built on NextUI's Chip with app defaults.
 * Showcases the colour × emphasis matrix and the icon slot.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="Colour (NextUI palette) × emphasis (tailwind-variants)."
      title="Variants"
    >
      <StoryGrid>
        <StoryGridHeader>
          <StoryGridHeaderRow>
            <StoryGridHeaderCell />
            <StoryGridHeaderCell>solid</StoryGridHeaderCell>
            <StoryGridHeaderCell>subtle</StoryGridHeaderCell>
          </StoryGridHeaderRow>
        </StoryGridHeader>
        <StoryGridBody>
          {colors.map((color) => (
            <StoryGridRow key={color}>
              <StoryGridCell isLabel>{color}</StoryGridCell>
              <StoryGridCell>
                <Chip color={color} emphasis="solid">
                  online
                </Chip>
              </StoryGridCell>
              <StoryGridCell>
                <Chip color={color} emphasis="subtle">
                  online
                </Chip>
              </StoryGridCell>
            </StoryGridRow>
          ))}
        </StoryGridBody>
      </StoryGrid>
    </StorySection>

    <StorySection title="With Icon">
      <div className="flex flex-wrap items-center gap-2">
        <Chip icon={<EventIcon size={14} />}>course</Chip>
        <Chip color="secondary" icon={<OnlineCallIcon size={14} />}>
          online
        </Chip>
      </div>
    </StorySection>

    <StorySection inContext={true} title="Examples">
      <div className="flex flex-wrap items-center gap-1">
        <Chip>online</Chip>
        <Chip color="secondary">Français</Chip>
        <Chip icon={<EventIcon size={14} />}>weekly</Chip>
      </div>
    </StorySection>

    <StorySection
      description="`radius=full` for pill corners, `onClose` for a trailing remove button (the active-filter pills)."
      title="Pill & removable"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip radius="full">online</Chip>
        <Chip closeLabel="Remove online" radius="full" onClose={() => {}}>
          online
        </Chip>
        <Chip closeLabel="Remove Français" color="secondary" radius="full" onClose={() => {}}>
          Français
        </Chip>
        <Chip closeLabel="Remove weekly" color="default" radius="full" onClose={() => {}}>
          weekly
        </Chip>
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Chip'
