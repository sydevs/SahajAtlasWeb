import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'

import { DetailRow } from './DetailRow'

// SSR markup assertions (node lane, no jsdom — see .claude/rules/tests.md). The
// leading box is always square (h-11 w-11) and models exactly two shapes.
describe('DetailRow', () => {
  it('renders the icon shape as a square box containing the icon', () => {
    const html = renderToStaticMarkup(
      <DetailRow box={{ kind: 'icon', icon: <span>ICON</span> }} content="c" title="t" />,
    )

    expect(html).toContain('ICON')
    expect(html).toContain('h-11 w-11')
  })

  it('renders the split shape with a top band and bottom line', () => {
    const html = renderToStaticMarkup(
      <DetailRow
        box={{ kind: 'split', top: 'JUL', bottom: 14 }}
        content="c"
        title="t"
        tone="plain"
      />,
    )

    expect(html).toContain('JUL')
    expect(html).toContain('14')
    expect(html).toContain('h-11 w-11') // still square
    expect(html).toContain('bg-primary-4') // the tinted top band
  })

  it('fills the box for the highlight tone', () => {
    const html = renderToStaticMarkup(
      <DetailRow
        box={{ kind: 'icon', icon: <span>I</span> }}
        content="c"
        title="t"
        tone="highlight"
      />,
    )

    expect(html).toContain('bg-primary-4')
    expect(html).toContain('text-background')
  })
})
