import type { Story, StoryDefault } from '@ladle/react'
import type { ComboboxOption } from './Combobox'

import { useState } from 'react'

import { StoryWrapper, StorySection } from '../../ladle'

import { Combobox } from './Combobox'

export default {
  title: 'Atoms / Inputs',
} satisfies StoryDefault

// Region-like options: a primary label and a breadcrumb `hint`. Both are
// searchable, so typing "Alberta" finds Calgary. That is why this uses a
// combobox, not a plain Select.
const options: ComboboxOption[] = [
  { value: 'calgary', label: 'Calgary', hint: 'Canada · Alberta' },
  { value: 'edmonton', label: 'Edmonton', hint: 'Canada · Alberta' },
  { value: 'toronto', label: 'Toronto', hint: 'Canada · Ontario' },
  { value: 'harrow', label: 'Harrow', hint: 'United Kingdom · England' },
  { value: 'bath', label: 'Bath', hint: 'United Kingdom · England' },
]

/**
 * Combobox — a search-in-the-field single-select, on Radix Popover and cmdk. The
 * search happens in the input itself. Selection happens on click. Once chosen,
 * the trigger shows only the short label. The breadcrumb hint stays in the list.
 * The region filter uses this component.
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
        description="`isInvalid` danger-borders the trigger + sets aria-invalid; `highlight` primary-tints an active/used field (no layout shift); `disabled` dims and blocks it; with no value the placeholder shows."
        title="States"
      >
        <div className="flex max-w-xs flex-col gap-3">
          <Combobox
            isInvalid
            aria-describedby="region-error"
            aria-label="Invalid region"
            options={options}
            placeholder="All regions"
            searchPlaceholder="Search regions…"
            value={value}
            onValueChange={setValue}
          />
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
