import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'

import { Dropdown } from './Dropdown'

// Node-only SSR assertions (see `.claude/rules/tests.md`). The panel is closed on
// first render (and portaled + positioned by Floating UI on the client), so we
// assert the trigger contract and that the panel content is absent until opened.
// Interactive behaviour (open, placement, flip/shift, dismiss) lives in Ladle /
// the browser.

describe('Dropdown', () => {
  it('renders the trigger as a focusable button and keeps the panel closed', () => {
    const html = renderToStaticMarkup(
      <Dropdown trigger={<span>Open</span>}>
        <p>Panel content</p>
      </Dropdown>,
    )

    expect(html).toContain('role="button"')
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('Open')
    // Closed by default → the portaled panel (and its content) is not in the SSR output.
    expect(html).not.toContain('Panel content')
  })

  it('takes its ARIA role from `role` so a dialog panel is announced correctly', () => {
    const html = renderToStaticMarkup(
      <Dropdown aria-label="Filters" role="dialog" trigger={<span>Open</span>}>
        <p>Panel content</p>
      </Dropdown>,
    )

    expect(html).toContain('aria-haspopup="dialog"')
  })
})
