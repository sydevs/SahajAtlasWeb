import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'

import { Dropdown } from './Dropdown'

// Node-only SSR assertions (see `docs/testing.md`). The panel is closed on
// first render. Floating UI portals and positions it only on the client. So
// this spec asserts the trigger contract, and that the panel content stays
// absent until opened. Interactive behaviour, such as open, placement, flip,
// shift, and dismiss, belongs in Ladle or the browser.

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
    // Closed by default: the portaled panel, and its content, is not in the SSR output.
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
