import type { Story, StoryDefault } from '@ladle/react'

import { useState } from 'react'

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

import { Checkbox } from './Checkbox'

export default {
  title: 'Atoms / Inputs',
} satisfies StoryDefault

// Rows are the palette colors, plus a `disabled` row — the disabled appearance is
// color-independent (a flat opacity), so one row stands in for all four. Columns
// are the two appearances the single control offers.
const rows = [
  { color: 'primary' as const },
  { color: 'secondary' as const },
  { color: 'contrast' as const },
  { color: 'neutral' as const },
  { color: 'primary' as const, disabled: true, label: 'disabled' },
]

/** Checkbox — one Radix control with a `switch` or `checkbox` appearance. */
export const Default: Story = () => {
  const [a, setA] = useState(true)
  const [b, setB] = useState(false)
  const [c, setC] = useState(false)

  return (
    <StoryWrapper>
      <StorySection
        description="Appearance × colour, all checked (disabled is color-independent)."
        title="Appearance × colour"
      >
        <StoryGrid>
          <StoryGridHeader>
            <StoryGridHeaderRow>
              <StoryGridHeaderCell />
              <StoryGridHeaderCell>Switch</StoryGridHeaderCell>
              <StoryGridHeaderCell>Checkbox</StoryGridHeaderCell>
            </StoryGridHeaderRow>
          </StoryGridHeader>
          <StoryGridBody>
            {rows.map(({ color, disabled, label }) => (
              <StoryGridRow key={label ?? color}>
                <StoryGridCell isLabel>{label ?? color}</StoryGridCell>
                <StoryGridCell>
                  <Checkbox checked color={color} disabled={disabled} />
                </StoryGridCell>
                <StoryGridCell>
                  <Checkbox checked appearance="checkbox" color={color} disabled={disabled} />
                </StoryGridCell>
              </StoryGridRow>
            ))}
          </StoryGridBody>
        </StoryGrid>
      </StorySection>

      <StorySection title="With label (controlled)">
        <div className="flex flex-col gap-3">
          <Checkbox checked={a} color="primary" onCheckedChange={setA}>
            Show online classes
          </Checkbox>
          <Checkbox checked={b} color="secondary" size="sm" onCheckedChange={setB}>
            Compact, secondary
          </Checkbox>
          <Checkbox appearance="checkbox" checked={c} color="primary" onCheckedChange={setC}>
            Keep me informed about upcoming events and news
          </Checkbox>
        </div>
      </StorySection>

      <StorySection
        description="`highlight` primary-tints the UNCHECKED control (no layout shift); once checked it keeps its solid fill."
        title="Highlighted"
      >
        <div className="flex flex-col gap-3">
          <Checkbox highlight checked={b} color="primary" onCheckedChange={setB}>
            Highlighted switch
          </Checkbox>
          <Checkbox
            highlight
            appearance="checkbox"
            checked={c}
            color="primary"
            onCheckedChange={setC}
          >
            Highlighted checkbox
          </Checkbox>
        </div>
      </StorySection>

      <StorySection
        description="`isInvalid` flags a validation error + sets aria-invalid — a danger ring on the switch, a danger border on the box (no layout shift). Pair with an aria-describedby error message."
        title="Invalid"
      >
        <div className="flex flex-col gap-3">
          <Checkbox isInvalid checked={b} color="primary" onCheckedChange={setB}>
            Invalid switch
          </Checkbox>
          <Checkbox
            isInvalid
            appearance="checkbox"
            checked={c}
            color="primary"
            onCheckedChange={setC}
          >
            I accept the terms
          </Checkbox>
        </div>
      </StorySection>

      <div />
    </StoryWrapper>
  )
}

Default.storyName = 'Checkbox'
