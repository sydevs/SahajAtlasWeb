import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Button } from '@/components/atoms/Button'

describe('Button', () => {
  // Icon-only buttons sit in flex header rows next to long, shrinkable titles
  // (e.g. the EventView close button). Default flex-shrink squashed the fixed
  // square into a rectangle — the glyph stayed put but the hover surface no
  // longer matched. The atom must pin both the squared width and shrink-0.
  it('keeps icon-only buttons a fixed square under flex compression', () => {
    const html = renderToStaticMarkup(
      <Button isIconOnly aria-label="Close" size="sm" variant="ghost">
        x
      </Button>,
    )

    expect(html).toContain('shrink-0')
    expect(html).toContain('w-8')
  })

  it('leaves labeled buttons shrinkable', () => {
    const html = renderToStaticMarkup(<Button size="sm">Label</Button>)

    expect(html).not.toContain('shrink-0')
  })
})
