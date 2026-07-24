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

    <StorySection description="sm (default) and md." title="Size">
      <div className="flex flex-wrap items-center gap-2">
        <Chip size="sm">small</Chip>
        <Chip size="md">medium</Chip>
      </div>
    </StorySection>

    <StorySection description="Square (sm, default) vs pill (full) corners." title="Radius">
      <div className="flex flex-wrap items-center gap-2">
        <Chip radius="sm">square</Chip>
        <Chip radius="full">pill</Chip>
      </div>
    </StorySection>

    <StorySection
      description="`onClose` adds a trailing remove button — pairs with `radius=full` for the active-filter pills."
      title="Removable"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Chip closeLabel="Remove online" color="default" radius="full" onClose={() => {}}>
          online
        </Chip>
        <Chip closeLabel="Remove Français" color="primary" radius="full" onClose={() => {}}>
          Français
        </Chip>
        <Chip closeLabel="Remove weekly" color="secondary" onClose={() => {}}>
          weekly
        </Chip>
      </div>
    </StorySection>

    <StorySection title="With icon">
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

    <div />
  </StoryWrapper>
)

Default.storyName = 'Chip'
