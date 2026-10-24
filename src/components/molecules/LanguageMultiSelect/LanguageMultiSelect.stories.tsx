import type { Story, StoryDefault } from '@ladle/react'

import { useState } from 'react'

import { StorySection, StoryWrapper } from '../../ladle'

import { LanguageMultiSelect } from './LanguageMultiSelect'

export default { title: 'Molecules' } satisfies StoryDefault

const OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'hi', label: 'Hindi' },
]

const labelOf = (codes: string[]) =>
  codes.map((code) => OPTIONS.find((option) => option.code === code)?.label ?? code).join(', ')

function Picker({ initial, highlight }: { initial: string[]; highlight?: boolean }) {
  const [value, setValue] = useState(initial)

  return (
    <LanguageMultiSelect
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
 * LanguageMultiSelect opens a checklist of languages. The search filters tint it while a
 * language is chosen; the add-a-class details step does not, since a class always has one.
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
Default.storyName = 'Language Multi Select'
