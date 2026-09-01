import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, it, expect } from 'vitest'

import { ListItem } from './ListItem'

// Node-only SSR assertions (see `docs/testing.md`). The row must be a valid
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

  it('keeps the row vertically centered: its items-center beats listRow items-stretch', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ListItem count={12} href="/regions/france" label="France" />
      </MemoryRouter>,
    )

    // The first class attribute is the row anchor's (the <li> wrapper is bare).
    const classes = (html.match(/class="([^"]*)"/)?.[1] ?? '').split(' ')

    expect(classes).toContain('flex-row')
    expect(classes).toContain('items-center')
    expect(classes).not.toContain('items-stretch')
  })

  // The trailing count and chevron step down from the title, and not to the same place:
  // the count is still information, the chevron only restates what tapping the row does.
  // Both were unstyled and inherited the row's default text colour — the same weight as
  // the title, which is what flattened the row's hierarchy.
  it('steps the count and the chevron below the title, the chevron furthest', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ListItem count={12} href="/regions/france" label="France" />
      </MemoryRouter>,
    )

    const count = html.match(/<div class="([^"]*)">12<\/div>/)?.[1] ?? ''

    expect(count.split(' ')).toContain('text-gray-10')
    // The chevron is the row's last element and the only <svg> in it.
    expect(html.match(/<svg[^>]*class="([^"]*)"/)?.[1] ?? '').toContain('text-gray-9')
    // The title keeps the row's inherited foreground — it stays the loudest thing here.
    expect(html).toContain('<div class="flex-grow text-lg"><div>France</div></div>')
  })
})
