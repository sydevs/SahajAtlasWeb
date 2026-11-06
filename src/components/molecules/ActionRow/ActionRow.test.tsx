import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ActionButton } from './ActionRow'

// The href gate itself is Button's (`Button.test.tsx`). This proves the wiring: the
// three shapes the row carries reach a real anchor, and external links keep the safe rel.
describe('ActionButton', () => {
  it.each([
    'https://www.google.com/maps/search/?api=1&query=51.5,-0.12',
    'https://example.org/',
    'tel:+441234567890',
  ])('renders %j as a real anchor', (href) => {
    const html = renderToStaticMarkup(<ActionButton href={href} icon={<svg />} label="Go" />)

    expect(html).toMatch(/^<a[\s>]/)
    expect(html).toContain(`href="${href.replace(/&/g, '&amp;')}"`)
  })

  it('keeps the external treatment on an allowed href', () => {
    const html = renderToStaticMarkup(
      <ActionButton isExternal href="https://example.org/" icon={<svg />} label="Website" />,
    )

    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('target="_blank"')
  })

  // Equal thirds cut "Directions" to "Directio…" in the 352px desktop panel (Browser L1). Each
  // action starts from its own label's width, so only a row too narrow for all of them truncates.
  it('sizes each action from its own label, not an equal share of the row', () => {
    const html = renderToStaticMarkup(<ActionButton icon={<svg />} label="Directions" />)
    const classes = /class="([^"]*)"/.exec(html)?.[1].split(/\s+/)

    expect(classes).toContain('flex-auto')
    expect(classes).not.toContain('basis-0')
    // Still allowed to shrink, so a row too narrow for every label truncates instead of overflowing.
    expect(classes).toContain('min-w-0')
  })

  it('renders a real button without an href, with its label visible', () => {
    const html = renderToStaticMarkup(<ActionButton icon={<svg />} label="Share" />)

    expect(html).toMatch(/^<button[\s>]/)
    expect(html).toContain('Share')
  })
})
