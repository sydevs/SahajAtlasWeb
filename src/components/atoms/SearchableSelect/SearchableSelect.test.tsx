import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect'

// SSR covers the closed trigger only (the filterable panel is a portal/focus surface
// — that's exercised in Ladle, per the tests rule). Assert the trigger reflects the
// controlled value: placeholder when empty, the option label when selected.
const OPTIONS: SearchableSelectOption[] = [
  { value: 'gb', label: 'United Kingdom' },
  { value: 'london', label: 'London', hint: 'United Kingdom' },
]

describe('SearchableSelect (SSR trigger)', () => {
  it('shows the placeholder when nothing is selected', () => {
    const html = renderToStaticMarkup(
      <SearchableSelect
        options={OPTIONS}
        placeholder="All regions"
        value={null}
        onChange={() => {}}
      />,
    )

    expect(html).toContain('All regions')
  })

  it('shows the selected option label instead of the placeholder', () => {
    const html = renderToStaticMarkup(
      <SearchableSelect
        options={OPTIONS}
        placeholder="All regions"
        value="london"
        onChange={() => {}}
      />,
    )

    expect(html).toContain('London')
    expect(html).not.toContain('All regions')
  })
})
