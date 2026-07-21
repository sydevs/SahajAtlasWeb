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

import { Button } from './Button'

import { CloseIcon, FilterIcon, ListIcon } from '@/components/atoms/Icons'

export default {
  title: 'Atoms',
} satisfies StoryDefault

const colors = ['primary', 'secondary', 'default', 'danger'] as const
const variants = ['solid', 'flat', 'faded', 'bordered', 'ghost'] as const
const sizes = ['sm', 'md', 'lg'] as const
const radii = ['sm', 'full'] as const

/**
 * Button — the app's one control component, on the Radix-semantic 12-step
 * tokens. It absorbed what used to be a separate IconButton via two orthogonal
 * props: `radius` (`sm` / `full`, matching Chip) sets the corner on any button,
 * and `isIconOnly` squares the width against the size scale. The colour ×
 * variant matrix lives in the exported `controlSurface` recipe, which
 * ActionCircle also skins its circle with, so `color` / `variant` / `size` /
 * `radius` mean the same thing across every control.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="Colour × variant, on the 12-step scale." title="Variants">
      <StoryGrid>
        <StoryGridHeader>
          <StoryGridHeaderRow>
            <StoryGridHeaderCell />
            {variants.map((variant) => (
              <StoryGridHeaderCell key={variant}>{variant}</StoryGridHeaderCell>
            ))}
          </StoryGridHeaderRow>
        </StoryGridHeader>
        <StoryGridBody>
          {colors.map((color) => (
            <StoryGridRow key={color}>
              <StoryGridCell isLabel>{color}</StoryGridCell>
              {variants.map((variant) => (
                <StoryGridCell key={variant}>
                  <Button color={color} variant={variant}>
                    Button
                  </Button>
                </StoryGridCell>
              ))}
            </StoryGridRow>
          ))}
        </StoryGridBody>
      </StoryGrid>
    </StorySection>

    <StorySection title="Sizes">
      <div className="flex flex-wrap items-center gap-2">
        {sizes.map((size) => (
          <Button key={size} color="primary" size={size}>
            {size}
          </Button>
        ))}
      </div>
    </StorySection>

    <StorySection
      description="`radius` is independent of what's inside — `sm` is the standard corner, `full` is fully round. On a labelled button that means a pill; on an icon-only one, a circle. Same two values as the Chip atom."
      title="Shapes"
    >
      <div className="flex flex-wrap items-center gap-2">
        {radii.map((radius) => (
          <Button key={radius} color="primary" radius={radius} variant="flat">
            radius={radius}
          </Button>
        ))}
      </div>
    </StorySection>

    <StorySection
      description="`isIconOnly` drops the horizontal padding and squares the width against the size scale, so the control stays a true square (or circle) at every size. Orthogonal to `radius`, and every colour and variant applies exactly as it does to a labelled button."
      title="Widths"
    >
      <div className="flex flex-col gap-4">
        {radii.map((radius) => (
          <div key={radius} className="flex flex-wrap items-center gap-2">
            {sizes.map((size) => (
              <Button
                key={size}
                isIconOnly
                aria-label={`${radius} ${size}`}
                color="primary"
                radius={radius}
                size={size}
                variant="flat"
              >
                <FilterIcon size={20} />
              </Button>
            ))}
            {colors.map((color) => (
              <Button
                key={color}
                isIconOnly
                aria-label={`${radius} ${color}`}
                color={color}
                radius={radius}
                size="md"
              >
                <FilterIcon size={20} />
              </Button>
            ))}
          </div>
        ))}
      </div>
    </StorySection>

    <StorySection
      description="The drawer header's controls: ghost + square + sm. Subtle until hovered, then full contrast, so close / list-toggle / filter read as one set."
      inContext={true}
      title="Examples"
    >
      <div className="flex items-center gap-1 rounded-lg border border-divider p-2">
        <Button isIconOnly aria-label="Filter" size="sm" variant="ghost">
          <FilterIcon size={20} />
        </Button>
        <Button isIconOnly aria-label="Explore" size="sm" variant="ghost">
          <ListIcon size={24} />
        </Button>
        <Button isIconOnly aria-label="Close" size="sm" variant="ghost">
          <CloseIcon size={20} />
        </Button>
      </div>
    </StorySection>

    <StorySection title="States">
      <div className="flex flex-wrap items-center gap-2">
        <Button isLoading color="primary">
          Loading
        </Button>
        <Button disabled color="primary">
          Disabled
        </Button>
        <Button color="primary" href="https://example.com" target="_blank" variant="flat">
          As link
        </Button>
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Button'
