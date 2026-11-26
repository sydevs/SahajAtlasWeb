import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Disclosure } from '.'

// Node-only SSR assertions (see `docs/testing.md`).
describe('Disclosure', () => {
  it('starts closed, with the panel unmounted and the trigger saying so', () => {
    const html = renderToStaticMarkup(
      <Disclosure title="More">
        <p>Hidden content</p>
      </Disclosure>,
    )

    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('More')
    expect(html).not.toContain('Hidden content')
  })

  it('renders the panel when it starts open', () => {
    const html = renderToStaticMarkup(
      <Disclosure defaultOpen title="More">
        <p>Shown content</p>
      </Disclosure>,
    )

    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('Shown content')
  })
})
