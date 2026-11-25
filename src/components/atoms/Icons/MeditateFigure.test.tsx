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

  it('carries its coral on the path, so no call site repeats it', () => {
    expect(html).toMatch(/<path[^>]*\sclass="text-contrast-10 dark:text-contrast"/)
    expect(html).not.toMatch(/<svg[^>]*\sclass=/)
  })

  it('carries no id, so two copies on one page cannot collide', () => {
    expect(html).not.toMatch(/\sid="/)
  })
})
