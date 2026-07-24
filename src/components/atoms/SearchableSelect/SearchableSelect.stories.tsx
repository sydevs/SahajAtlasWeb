import type { Story, StoryDefault } from '@ladle/react'

import { useState } from 'react'

import { StoryWrapper, StorySection } from '../../ladle'

import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect'

export default {
  title: 'Atoms',
} satisfies StoryDefault

// A region-shaped option set: same-named places are disambiguated by the `hint`
// (level / breadcrumb), which the filter also searches.
const REGIONS: SearchableSelectOption[] = [
  { value: 'gb', label: 'United Kingdom', hint: 'Country' },
  { value: 'london', label: 'London', hint: 'United Kingdom' },
  { value: 'ealing', label: 'Ealing', hint: 'London · United Kingdom' },
  { value: 'manchester', label: 'Manchester', hint: 'United Kingdom' },
  { value: 'de', label: 'Germany', hint: 'Country' },
  { value: 'berlin', label: 'Berlin', hint: 'Germany' },
  { value: 'in', label: 'India', hint: 'Country' },
  { value: 'pune', label: 'Pune', hint: 'India' },
]

/** SearchableSelect — a type-to-filter single picker (used for the Region filter). */
export const Default: Story = () => {
  const [value, setValue] = useState<string | null>('london')

  return (
    <StoryWrapper>
      <StorySection
        description="A field-styled trigger opens a filter input over a scrollable option list. Type to filter (label + hint); selecting the current option clears it. Fully controlled."
        title="Searchable select"
      >
        <div className="w-64">
          <SearchableSelect
            aria-label="Region"
            emptyLabel="No regions found"
            options={REGIONS}
            placeholder="All regions"
            searchPlaceholder="Search regions…"
            value={value}
            onChange={setValue}
          />
        </div>
      </StorySection>
    </StoryWrapper>
  )
}

Default.storyName = 'Searchable Select'
