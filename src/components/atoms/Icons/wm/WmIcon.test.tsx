import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { WmIcon } from './WmIcon'

describe('WmIcon', () => {
  const html = renderToStaticMarkup(<WmIcon className="text-ornament" name="meditate" size={24} />)

  it('draws in the current text colour, not the app file’s own paint', () => {
    expect(html).toContain('currentColor')
    expect(html).not.toMatch(/(fill|stroke)="#[0-9a-fA-F]{3,8}"/)
    expect(html).toContain('text-ornament')
  })

  it('namespaces the clip-path id, so two inline icons cannot clip each other', () => {
    expect(html).toContain('id="sy-wm-meditate-current-a"')
    expect(html).toContain('url(#sy-wm-meditate-current-a)')
    expect(html).not.toContain('id="a"')
  })

  it('is decorative and sized by its span', () => {
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('width:24px;height:24px')
  })
})
