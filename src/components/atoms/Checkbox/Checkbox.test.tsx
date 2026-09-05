import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'

import { Checkbox } from './Checkbox'

// Node-only SSR-markup assertions (see `docs/testing.md`). The disabled
// styling is pure CSS, hung off Radix's `data-disabled` attribute. So this spec
// guards that contract. If Radix stopped emitting the attribute, every disabled
// rule would silently stop matching. The control would go back to rendering a
// faded brand fill. Which of the two colours actually wins is CSS specificity,
// which SSR markup cannot express. That check belongs in Ladle or the browser.

describe('Checkbox', () => {
  it('marks the disabled switch and its thumb with the attribute the styling keys off', () => {
    const html = renderToStaticMarkup(<Checkbox checked disabled color="primary" />)

    // The root (the track) and the thumb both need it. They carry separate overrides.
    expect(html.match(/data-disabled=""/g)).toHaveLength(2)
    expect(html).toContain('data-[disabled]:data-[state=checked]:bg-gray-9')
    expect(html).toContain('data-[disabled]:bg-gray-5')
  })

  it('marks the disabled checkbox box with the same attribute', () => {
    const html = renderToStaticMarkup(<Checkbox checked disabled appearance="checkbox" />)

    expect(html).toContain('data-disabled=""')
    expect(html).toContain('data-[disabled]:data-[state=checked]:bg-gray-9')
    // The box fills when unchecked. So "off and disabled" is not a fainter plain box.
    expect(html).toContain('data-[disabled]:bg-gray-4')
  })

  it('leaves the attribute off an enabled control', () => {
    const html = renderToStaticMarkup(<Checkbox checked color="primary" />)

    expect(html).not.toContain('data-disabled')
    expect(html).toContain('data-[state=checked]:bg-primary-12')
  })
})
