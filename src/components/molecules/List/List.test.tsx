import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'

import { List } from './List'

// Node-only SSR assertions (see `docs/testing.md`). The widget's CSS
// injects into HOST documents, so the <ul> cannot rely on Tailwind's
// preflight alone. A host typography rule on bare `ul` or `li` beats
// preflight's inherited reset and paints bullets next to every card.
// These assertions pin the explicit class-level resets that out-specify
// those element rules.

describe('List', () => {
  it('renders a <ul> with explicit list resets so host element rules cannot paint bullets', () => {
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
    // This is the li-level marker suppression. A host `li { list-style:
    // disc }` beats inheritance from the ul, so each <li> needs its own
    // reset. SSR escapes the arbitrary-variant selector's & and > in the
    // attribute value.
    expect(classes).toContain('[&amp;&gt;li]:list-none')
  })
})
