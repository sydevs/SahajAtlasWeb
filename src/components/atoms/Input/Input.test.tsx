import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Input } from './Input'

describe('Input', () => {
  it('takes the dark color scheme under a dark theme, so a native picker matches the panel', () => {
    const markup = renderToStaticMarkup(<Input className="max-w-48" type="date" />)

    expect(markup).toContain('dark:[color-scheme:dark]')
    expect(markup).toContain('max-w-48')
  })
})
