import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { RadioGroup, type RadioOption } from '@/components/atoms/RadioGroup'

const options: RadioOption[] = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
  { value: 'c', label: 'C' },
  { value: 'd', label: 'D' },
]

const radios = (html: string) => (html.match(/type="radio"/g) ?? []).length

// Split rather than match a substring: `accent-primary` occurs inside
// `accent-primary-foreground`.
const classesOf = (tag = '') => (tag.match(/class="([^"]*)"/)?.[1] ?? '').split(' ')
const marks = (html: string) => {
  const tags = html.match(/<input[^>]*>/g) ?? []

  return {
    checked: classesOf(tags.find((tag) => tag.includes('checked'))),
    unchecked: classesOf(tags.find((tag) => !tag.includes('checked'))),
  }
}

describe('RadioGroup', () => {
  it('renders one radio per option and marks exactly the selected value checked', () => {
    const html = renderToStaticMarkup(
      <RadioGroup name="x" options={options} value="b" onChange={() => {}} />,
    )

    expect(radios(html)).toBe(4)
    expect((html.match(/checked/g) ?? []).length).toBe(1)
  })

  it('accents the checked mark with the card solid’s on-colour, never the solid itself', () => {
    const { checked, unchecked } = marks(
      renderToStaticMarkup(<RadioGroup name="x" options={options} value="b" onChange={() => {}} />),
    )

    expect(checked).toContain('accent-primary-foreground')
    expect(checked).not.toContain('accent-primary')
    expect(unchecked).toContain('accent-primary')
  })

  it('follows the checked card to danger when the group is invalid', () => {
    const { checked } = marks(
      renderToStaticMarkup(
        <RadioGroup isInvalid name="x" options={options} value="b" onChange={() => {}} />,
      ),
    )

    expect(checked).toContain('accent-danger-foreground')
    expect(checked).not.toContain('accent-primary-foreground')
  })

  it('collapses options past collapseAfter behind the reveal link', () => {
    const html = renderToStaticMarkup(
      <RadioGroup
        collapseAfter={2}
        moreLabel="Show more"
        name="x"
        options={options}
        value="a"
        onChange={() => {}}
      />,
    )

    expect(radios(html)).toBe(2)
    expect(html).toContain('Show more')
  })

  it('does not render the reveal link when options fit within collapseAfter', () => {
    const html = renderToStaticMarkup(
      <RadioGroup
        collapseAfter={4}
        moreLabel="Show more"
        name="x"
        options={options}
        value="a"
        onChange={() => {}}
      />,
    )

    expect(radios(html)).toBe(4)
    expect(html).not.toContain('Show more')
  })
})
