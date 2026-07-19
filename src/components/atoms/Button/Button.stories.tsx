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

/**
 * Button — the app's one control component, on the Radix-semantic 12-step
 * tokens. `shape` covers what used to be a separate IconButton: `rect` is the
 * label-bearing default, `square` and `circle` are icon-only and take their
 * width from the size scale. The colour × variant matrix lives in the exported
 * `controlSurface` recipe, which ActionCircle also skins its circle with, so
 * `color` / `variant` / `size` mean the same thing across every control.
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
      description="`square` and `circle` are icon-only: the width tracks the size scale, so the control stays a true square at every size. Every colour and variant applies here exactly as it does to a label button."
      title="Shapes"
    >
      <div className="flex flex-col gap-4">
        {(['square', 'circle'] as const).map((shape) => (
          <div key={shape} className="flex flex-wrap items-center gap-2">
            {sizes.map((size) => (
              <Button
                key={size}
                aria-label={`${shape} ${size}`}
                color="primary"
                shape={shape}
                size={size}
                variant="flat"
              >
                <FilterIcon size={20} />
              </Button>
            ))}
            {colors.map((color) => (
              <Button
                key={color}
                aria-label={`${shape} ${color}`}
                color={color}
                shape={shape}
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
        <Button aria-label="Filter" shape="square" size="sm" variant="ghost">
          <FilterIcon size={20} />
        </Button>
        <Button aria-label="Explore" shape="square" size="sm" variant="ghost">
          <ListIcon size={24} />
        </Button>
        <Button aria-label="Close" shape="square" size="sm" variant="ghost">
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
