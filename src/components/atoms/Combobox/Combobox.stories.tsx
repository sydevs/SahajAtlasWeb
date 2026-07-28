import type { Story, StoryDefault } from '@ladle/react'
import type { ComboboxOption } from './Combobox'

import { useState } from 'react'

import { StoryWrapper, StorySection } from '../../ladle'

import { Combobox } from './Combobox'

export default {
  title: 'Atoms / Inputs',
} satisfies StoryDefault

// Region-like options: a primary label + a breadcrumb `hint`. Both are searchable, so typing
// "Alberta" finds Calgary — the reason this is a combobox and not a plain Select.
const options: ComboboxOption[] = [
  { value: 'calgary', label: 'Calgary', hint: 'Canada · Alberta' },
  { value: 'edmonton', label: 'Edmonton', hint: 'Canada · Alberta' },
  { value: 'toronto', label: 'Toronto', hint: 'Canada · Ontario' },
  { value: 'harrow', label: 'Harrow', hint: 'United Kingdom · England' },
  { value: 'bath', label: 'Bath', hint: 'United Kingdom · England' },
]

/**
 * Combobox — search-in-the-field single-select (Radix Popover + cmdk). The search happens in
 * the input itself and selection on click; once chosen, the trigger shows just the short label
 * (the breadcrumb hint stays in the list). Used by the region filter.
 */
export const Default: Story = () => {
  const [value, setValue] = useState<string | undefined>('calgary')

  return (
    <StoryWrapper>
      <StorySection
        description="Type to filter by name or breadcrumb; click to select. The trigger shows only the short label once chosen."
        title="Combobox"
      >
        <div className="max-w-xs">
          <Combobox
            aria-label="Region"
            emptyLabel="No regions found"
            options={options}
            placeholder="All regions"
            searchPlaceholder="Search regions…"
            value={value}
            onValueChange={setValue}
          />
        </div>
      </StorySection>

      <StorySection
        description="`highlight` primary-tints the trigger to flag an active/used field (no layout shift); `disabled` dims and blocks it; with no value the placeholder shows."
        title="States"
      >
        <div className="flex max-w-xs flex-col gap-3">
          <Combobox
            highlight
            aria-label="Highlighted region"
            options={options}
            placeholder="All regions"
            searchPlaceholder="Search regions…"
            value={value}
            onValueChange={setValue}
          />
          <Combobox
            disabled
            aria-label="Disabled region"
            options={options}
            placeholder="All regions"
            value={value}
            onValueChange={setValue}
          />
          <Combobox
            aria-label="Empty region"
            options={options}
            placeholder="All regions"
            searchPlaceholder="Search regions…"
          />
        </div>
      </StorySection>

      <div />
    </StoryWrapper>
  )
}

Default.storyName = 'Combobox'
