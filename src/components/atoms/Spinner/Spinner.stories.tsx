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

import { Spinner } from './Spinner'

export default {
  title: 'Atoms',
} satisfies StoryDefault

const colors = ['primary', 'secondary', 'contrast', 'neutral'] as const
const sizes = ['sm', 'md', 'lg'] as const

/** Spinner — a pure-CSS loading indicator on the brand/neutral tokens. */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="Colour (token) × size." title="Colour × size">
      <StoryGrid>
        <StoryGridHeader>
          <StoryGridHeaderRow>
            <StoryGridHeaderCell />
            {sizes.map((size) => (
              <StoryGridHeaderCell key={size}>{size}</StoryGridHeaderCell>
            ))}
          </StoryGridHeaderRow>
        </StoryGridHeader>
        <StoryGridBody>
          {colors.map((color) => (
            <StoryGridRow key={color}>
              <StoryGridCell isLabel>{color}</StoryGridCell>
              {sizes.map((size) => (
                <StoryGridCell key={size}>
                  <Spinner color={color} size={size} />
                </StoryGridCell>
              ))}
            </StoryGridRow>
          ))}
        </StoryGridBody>
      </StoryGrid>
    </StorySection>

    <StorySection title="With label">
      <Spinner color="secondary" label="Loading…" />
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Spinner'
