import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, it, expect } from 'vitest'

import { ListItem } from './ListItem'

// Node-only SSR assertions (see `docs/testing.md`). ListRow's own specs
// (List.test.tsx) cover the <li><a> nesting and the chevron. MemoryRouter
// supplies the router context the internal Link needs.

describe('ListItem', () => {
  // The trailing count and chevron step down from the title, and not to
  // the same place. The count is still information, so it holds the ramp's readable text step
  // — `gray-10` is a hover solid, and measured 3.9:1 here (#432). The chevron only
  // restates what tapping the row does, so it goes one step further. Both were unstyled, and
  // inherited the row's default text colour, the same weight as the
  // title. That is what flattened the row's hierarchy.
  it('steps the count and the chevron below the title, the chevron furthest', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ListItem count={12} href="/regions/france" label="France" />
      </MemoryRouter>,
    )

    const count = html.match(/<div class="([^"]*)">12<\/div>/)?.[1] ?? ''

    expect(count.split(' ')).toContain('text-gray-11')
    // The chevron is the row's last element and the only <svg> in it.
    expect(html.match(/<svg[^>]*class="([^"]*)"/)?.[1] ?? '').toContain('text-gray-9')
    // The title keeps the row's inherited foreground — it stays the loudest thing here.
    expect(html).toContain('<div class="flex-grow text-lg">France</div>')
  })
})
