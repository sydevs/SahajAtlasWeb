import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, it, expect } from 'vitest'

import { ListItem } from './ListItem'

// Node-only SSR assertions (see `.claude/rules/tests.md`). The row must be a valid
// direct child of the List's <ul>: an <li> wrapping the <Link>/<a>, NOT an <a>
// wrapping an <li> (the pre-#65 nesting). MemoryRouter supplies the router context
// the internal Link needs.

describe('ListItem', () => {
  it('nests as <li><a> so the <li> is a direct child of the list <ul>', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ListItem count={12} href="/regions/france" label="France" />
      </MemoryRouter>,
    )

    // <li> is the outermost element and wraps the anchor: <li><a>…</a></li>.
    expect(html.startsWith('<li>')).toBe(true)
    expect(html).toMatch(/^<li><a[\s>]/)
    expect(html.trimEnd().endsWith('</a></li>')).toBe(true)
    // The anchor must NOT be the outer element (the invalid <a><li> nesting).
    expect(html).not.toMatch(/^<a[\s>]/)
    // Sanity: the row still renders its content.
    expect(html).toContain('France')
    expect(html).toContain('12')
  })
})
