import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'

import { Chip } from '.'

// Node-only SSR assertions (see `CLAUDE.md § Testing`). A focus ring is a class
// string, so this is exactly the kind of thing the SSR lane can pin — and worth pinning,
// because the failure mode is invisible: the button still works, it just stops showing
// keyboard users where they are.

describe('Chip close button focus', () => {
  it('draws the app-standard focus ring, not only an opacity change', () => {
    // Opacity is also what hover does, so on a chip the pointer happens to be resting on,
    // the opacity lift told a keyboard user nothing (issue #102).
    const html = renderToStaticMarkup(
      <Chip closeLabel="Remove filter" onClose={() => {}}>
        Weekly
      </Chip>,
    )

    expect(html).toContain('focus-visible:ring-2')
    expect(html).toContain('focus-visible:ring-focus')
  })

  it('still pairs the close button with its accessible name', () => {
    const html = renderToStaticMarkup(
      <Chip closeLabel="Remove filter" onClose={() => {}}>
        Weekly
      </Chip>,
    )

    expect(html).toContain('aria-label="Remove filter"')
    expect(html).toContain('type="button"')
  })

  it('renders no close button when there is nothing to close', () => {
    const html = renderToStaticMarkup(<Chip>Weekly</Chip>)

    expect(html).not.toContain('<button')
  })
})
