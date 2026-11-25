import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { ListItem } from './ListItem'
import { ListItemSkeleton } from './ListItemSkeleton'

// Node-only SSR assertions (see `docs/testing.md`).

/** Interaction and focus styling the `Link` atom and `listRow` add, which moves nothing. */
const LINK_ONLY =
  /^(block|items-stretch|text-inherit|transition-colors|outline-none|relative|rounded-lg|touch-target|(dark:)?(hover|active|focus-visible):.*)$/
const layout = (html: string, element: string) =>
  (html.match(new RegExp(`<${element} class="([^"]*)"`))?.[1] ?? '')
    .split(' ')
    .filter((name) => !LINK_ONLY.test(name))
    .sort()

describe('ListItemSkeleton', () => {
  it('draws the real row’s box: its height, gutter and alignment', () => {
    const real = renderToStaticMarkup(
      <MemoryRouter>
        <ListItem count={12} href="/gb" label="United Kingdom" />
      </MemoryRouter>,
    )
    const skeleton = renderToStaticMarkup(<ListItemSkeleton />)

    expect(layout(skeleton, 'div')).toEqual(layout(real, 'a'))
  })

  it('offers nothing to press or focus', () => {
    const html = renderToStaticMarkup(<ListItemSkeleton icon />)

    expect(html).not.toMatch(/<(a|button|input)[\s>]/)
    expect(html).not.toContain('tabindex')
  })
})
