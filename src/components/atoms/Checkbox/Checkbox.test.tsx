import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'

import { Checkbox } from './Checkbox'

// Node-only SSR-markup assertions (see `.claude/rules/tests.md`). The disabled
// styling is pure CSS hanging off Radix's `data-disabled`, so what's worth
// guarding is that contract: if Radix stopped emitting the attribute, every
// disabled rule would silently stop matching and the control would go back to
// rendering a faded brand fill. Which of the two colours actually wins is CSS
// specificity, which SSR markup can't express — that's a Ladle/browser check.

describe('Checkbox', () => {
  it('marks the disabled switch and its thumb with the attribute the styling keys off', () => {
    const html = renderToStaticMarkup(<Checkbox checked disabled color="primary" />)

    // Root (the track) and the thumb both need it — they carry separate overrides.
    expect(html.match(/data-disabled=""/g)).toHaveLength(2)
    expect(html).toContain('data-[disabled]:data-[state=checked]:bg-gray-9')
    expect(html).toContain('data-[disabled]:bg-gray-5')
  })

  it('marks the disabled checkbox box with the same attribute', () => {
    const html = renderToStaticMarkup(<Checkbox checked disabled appearance="checkbox" />)

    expect(html).toContain('data-disabled=""')
    expect(html).toContain('data-[disabled]:data-[state=checked]:bg-gray-9')
    // Filled when unchecked, so "off and disabled" isn't a fainter plain box.
    expect(html).toContain('data-[disabled]:bg-gray-4')
  })

  it('leaves the attribute off an enabled control', () => {
    const html = renderToStaticMarkup(<Checkbox checked color="primary" />)

    expect(html).not.toContain('data-disabled')
    expect(html).toContain('data-[state=checked]:bg-primary-12')
  })
})
