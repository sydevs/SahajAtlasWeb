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

export default {
  title: 'Atoms',
} satisfies StoryDefault

const colors = ['primary', 'secondary', 'default', 'danger'] as const
const variants = ['solid', 'flat', 'faded', 'bordered'] as const

/**
 * Button — a styled control on the Radix-semantic 12-step tokens. Shows the
 * colour × variant matrix, sizes, and the loading/disabled/icon states.
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
        <Button color="primary" size="sm">
          Small
        </Button>
        <Button color="primary" size="md">
          Medium
        </Button>
        <Button color="primary" size="lg">
          Large
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
