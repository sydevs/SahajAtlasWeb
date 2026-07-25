import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'

import { List } from './List'

// Node-only SSR assertions (see `.claude/rules/tests.md`). The widget's CSS is
// injected into HOST documents, so the <ul> can't rely on Tailwind's preflight
// alone: a host typography rule on bare `ul`/`li` beats preflight's inherited
// reset and paints bullets next to every card. These assertions pin the explicit
// class-level resets that out-specific those element rules.

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
    // The li-level marker suppression — a host `li { list-style: disc }` beats
    // inheritance from the ul, so each <li> needs its own reset. SSR escapes the
    // arbitrary-variant selector's & and > in the attribute value.
    expect(classes).toContain('[&amp;&gt;li]:list-none')
  })
})
