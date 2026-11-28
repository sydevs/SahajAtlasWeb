import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { MeditateFigure } from './MeditateFigure'

describe('MeditateFigure', () => {
  const html = renderToStaticMarkup(<MeditateFigure />)

  it('draws in the current text colour and is hidden from screen readers, like a lucide glyph', () => {
    expect(html).toContain('stroke="currentColor"')
    expect(html).not.toMatch(/(fill|stroke)="#[0-9a-fA-F]{3,8}"/)
    expect(html).toContain('aria-hidden="true"')
    expect(renderToStaticMarkup(<MeditateFigure size={18} />)).toContain('height="18"')
  })

  it('takes the surrounding text colour, or a class on it, as a lucide glyph does', () => {
    expect(html).not.toMatch(/<path[^>]*\sclass=/)
    expect(renderToStaticMarkup(<MeditateFigure className="text-contrast-10" />)).toMatch(
      /<svg[^>]*\sclass="text-contrast-10"/,
    )
  })

  it('carries no id, so two copies on one page cannot collide', () => {
    expect(html).not.toMatch(/\sid="/)
  })
})
