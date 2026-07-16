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

/**
 * Alert — a status banner on the Radix-semantic tokens (danger stays the fixed
 * status red). Supports `size` (`sm`), a dismiss button (`onClose`), single-line
 * auto-centring with an `align` override, and a `role` (assertive `alert` / polite
 * `status`).
 */
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
      description="`sm` slims the padding + gap for compact inline prompts."
      title="Sizes"
    >
      <div className="flex max-w-sm flex-col gap-3">
        <Alert color="primary" description="Default padding." title="Medium (default)" />
        <Alert color="primary" description="Tighter padding and gap." size="sm" title="Small" />
      </div>
    </StorySection>

    <StorySection description="`onClose` adds a small, subtle dismiss ×." title="Dismissible">
      <div className="max-w-sm">
        <Alert
          closeLabel="Dismiss"
          color="primary"
          title="A dismissible single-line alert"
          onClose={() => {}}
        />
      </div>
    </StorySection>

    <StorySection
      description="One field auto-centres the icon (and ×) — visible when it wraps; two fields top-align so the icon sits with the first line. Pass `align` to override."
      title="Alignment"
    >
      <div className="flex max-w-xs flex-col gap-3">
        <Alert
          color="default"
          description="A single, longer field that wraps onto two or three lines — with one field the icon auto-centres against the block."
        />
        <Alert
          align="start"
          color="default"
          description="The same wrapping field, but align=start pins the icon to the first line instead."
        />
        <Alert
          color="default"
          description="With two fields the icon top-aligns with the first line by default."
          title="Title + description"
        />
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Alert'
