import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CheckboxGroup, type CheckboxGroupOption } from './CheckboxGroup'

// Node-only SSR assertions (see `docs/testing.md`): the order and the search box are decided at
// render; typing in the box is the story's to show.
const options = (n: number): CheckboxGroupOption[] =>
  Array.from({ length: n }, (_, i) => ({ value: `o${i}`, label: `Option ${i}` }))

const render = (n: number, value: string[]) =>
  renderToStaticMarkup(
    <CheckboxGroup
      aria-label="Language"
      options={options(n)}
      searchLabel="Search languages"
      value={value}
      onChange={() => {}}
    />,
  )

const order = (html: string) => [...html.matchAll(/Option (\d+)/g)].map((m) => Number(m[1]))

describe('CheckboxGroup', () => {
  it('keeps a short list in its own order, with no search box', () => {
    const html = render(10, ['o7'])

    expect(order(html)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(html).not.toContain('Search languages')
  })

  it('opens a long list with its checked options first, and a search box', () => {
    const html = render(11, ['o9', 'o4'])

    expect(order(html).slice(0, 3)).toEqual([4, 9, 0])
    expect(html).toContain('aria-label="Search languages"')
  })
})
