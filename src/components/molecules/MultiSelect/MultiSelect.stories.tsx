import type { Story, StoryDefault } from '@ladle/react'

import { useState } from 'react'

import { StorySection, StoryWrapper } from '../../ladle'

import { MultiSelect } from './MultiSelect'

export default { title: 'Molecules' } satisfies StoryDefault

const OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'hi', label: 'Hindi' },
]

const labelOf = (codes: string[]) =>
  codes.map((code) => OPTIONS.find((option) => option.value === code)?.label ?? code).join(', ')

function Picker({ initial, highlight }: { initial: string[]; highlight?: boolean }) {
  const [value, setValue] = useState(initial)

  return (
    <MultiSelect
      highlight={highlight && value.length > 0}
      label="Language"
      options={OPTIONS}
      triggerLabel={value.length === 0 ? 'All languages' : labelOf(value)}
      value={value}
      onChange={setValue}
    />
  )
}

/**
 * MultiSelect opens a checklist behind a field. Both of its users pick languages: the search
 * filters tint it while one is chosen, and the add-a-class details step does not, since a
 * class always has one.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection title="Variants">
      <StorySection title="Nothing chosen" variant="subsection">
        <div className="max-w-xs">
          <Picker initial={[]} />
        </div>
      </StorySection>
      <StorySection title="An active filter" variant="subsection">
        <div className="max-w-xs">
          <Picker highlight initial={['fr', 'en']} />
        </div>
      </StorySection>
    </StorySection>
    <div />
  </StoryWrapper>
)
Default.storyName = 'Multi Select'
