import type { Story, StoryDefault } from '@ladle/react'

import { useState } from 'react'

import { StorySection, StoryWrapper } from '../../ladle'

import { CheckboxGroup, type CheckboxGroupOption } from './CheckboxGroup'

export default { title: 'Molecules' } satisfies StoryDefault

const LANGUAGES = [
  ['English', 333],
  ['French', 44],
  ['German', 43],
  ['Spanish', 38],
  ['Hindi', 31],
  ['Italian', 24],
  ['Portuguese', 19],
  ['Dutch', 19],
  ['Romanian', 12],
  ['Polish', 9],
  ['Swedish', 8],
  ['Čeština', 8],
  ['Japanese', 0],
] as const

const options = (n: number): CheckboxGroupOption[] =>
  LANGUAGES.slice(0, n).map(([label, count]) => ({
    value: label,
    label,
    count,
    disabled: count === 0,
  }))

function Example({ n, initial }: { n: number; initial: string[] }) {
  const [value, setValue] = useState(initial)

  return (
    <div className="w-72 rounded-lg border border-divider p-2">
      <CheckboxGroup
        aria-label="Language"
        options={options(n)}
        searchLabel="Search languages"
        value={value}
        onChange={setValue}
      />
    </div>
  )
}

/**
 * CheckboxGroup — checkboxes with a count at each row's end. Past 10 options the list gets a search
 * box (case- and accent-blind: "ces" finds "Čeština") and keeps its checked options at the top.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="Ten or fewer: no search, the options' own order." title="Short">
      <Example initial={['French']} n={5} />
    </StorySection>
    <StorySection
      description="More than ten: a search box, and Swedish and Polish, checked, lead the list."
      title="Long"
    >
      <Example initial={['Swedish', 'Polish']} n={LANGUAGES.length} />
    </StorySection>
  </StoryWrapper>
)

Default.storyName = 'Checkbox Group'
