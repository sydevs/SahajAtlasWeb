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

import { Alert } from './Alert'

export default {
  title: 'Atoms',
} satisfies StoryDefault

const colors = ['primary', 'secondary', 'default', 'danger'] as const
const variants = ['flat', 'bordered', 'faded'] as const

/** Alert — a status banner on the Radix-semantic tokens (danger stays the fixed status red). */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="Colour × variant." title="Variants">
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
                  <Alert
                    color={color}
                    description="A short status message."
                    title="Heads up"
                    variant={variant}
                  />
                </StoryGridCell>
              ))}
            </StoryGridRow>
          ))}
        </StoryGridBody>
      </StoryGrid>
    </StorySection>

    <StorySection title="Without icon">
      <Alert hideIcon color="primary" description="An inline notice with no icon." title="Note" />
    </StorySection>

    <StorySection
      description="`sm` slims the padding for compact inline prompts; `onClose` adds a dismiss button, and a single-line alert vertically centres its icon and ×."
      title="Small & dismissible"
    >
      <div className="flex max-w-sm flex-col gap-3">
        <Alert color="primary" description="Default padding, two lines." title="Medium (default)" />
        <Alert
          closeLabel="Dismiss"
          color="primary"
          size="sm"
          title="Small, single line, dismissible"
          onClose={() => {}}
        />
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Alert'
