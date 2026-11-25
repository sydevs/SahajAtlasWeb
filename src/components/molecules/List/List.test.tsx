import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'

import { List, listRow, ListRowChevron } from './List'

// Node-only SSR assertions (see `docs/testing.md`). These pin the
// explicit class-level resets, which duplicate preflight on purpose —
// `List.tsx` carries why they are kept now that no host rule can reach
// the <ul> (#236).

describe('List', () => {
  it('renders a <ul> with explicit list resets, independent of preflight', () => {
    const html = renderToStaticMarkup(
      <List>
        <li>row</li>
      </List>,
    )
    const classes = (html.match(/class="([^"]*)"/)?.[1] ?? '').split(' ')

    expect(html).toMatch(/^<ul[\s>]/)
    expect(classes).toContain('list-none')
    expect(classes).toContain('m-0')
    expect(classes).toContain('p-0')
    // The li-level marker suppression. Preflight resets `ol, ul, menu`
    // and not `li`, so without this each <li> only inherits the reset
    // from the ul. SSR escapes the arbitrary-variant selector's & and >
    // in the attribute value.
    expect(classes).toContain('[&amp;&gt;li]:list-none')
  })

  it('lays a row out centred, and ends it in a chevron that mirrors in RTL', () => {
    expect(listRow().split(' ')).toEqual(
      expect.arrayContaining(['flex', 'items-center', 'px-gutter']),
    )

    const html = renderToStaticMarkup(<ListRowChevron />)
    const classes = (html.match(/class="([^"]*)"/)?.[1] ?? '').split(' ')

    expect(html).toMatch(/^<svg[\s>]/)
    expect(html).toContain('width="20"')
    expect(classes).toEqual(expect.arrayContaining(['text-gray-9', 'rtl:-scale-x-100']))
  })
})
