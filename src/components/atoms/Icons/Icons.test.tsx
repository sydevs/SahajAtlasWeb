import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import { Check } from 'lucide-react'

import { Logo, SocialIcon } from '.'

// Node-only component test (mirrors WeMeditateWeb): no jsdom / Testing Library.
// Presentational components are asserted via their SSR markup with
// renderToStaticMarkup — this file is the template for component coverage in
// this repo (see `docs/testing.md`). Hover/portal/interaction behaviour
// belongs in Ladle and the browser, not here.
//
// Since #003 the interface glyphs come from `lucide-react` and only the brand marks are
// ours, so this file covers both sides of that seam: what Lucide guarantees (the two
// contracts the swap had to preserve) and what we still draw ourselves.

describe('lucide icons — the contracts the swap had to keep', () => {
  // Both were previously supplied by our own `BaseIcon`. If a Lucide upgrade ever drops
  // either, every icon in the app regresses at once and nothing else would say so.
  it('draws with currentColor, so a glyph takes its surrounding text colour', () => {
    const html = renderToStaticMarkup(<Check />)

    expect(html).toContain('stroke="currentColor"')
    // Outline only: the fill must not paint over the stroke.
    expect(html).toContain('fill="none"')
  })

  it('hides itself from the accessibility tree, since every icon here is decorative', () => {
    expect(renderToStaticMarkup(<Check />)).toContain('aria-hidden="true"')
  })

  it('forwards the size prop to the rendered svg', () => {
    const html = renderToStaticMarkup(<Check size={48} />)

    expect(html).toContain('width="48"')
    expect(html).toContain('height="48"')
  })
})

// Lucide removed its brand icons and redrawing them is a trademark problem, so these
// stay hand-drawn on our own BaseIcon.
describe('the brand marks we still own', () => {
  it('renders the logo as an accessible, presentational svg with a path', () => {
    const html = renderToStaticMarkup(<Logo />)

    expect(html).toContain('<svg')
    expect(html).toContain('role="presentation"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('<path')
  })

  it('resolves a platform glyph from its key', () => {
    expect(renderToStaticMarkup(<SocialIcon platform="zoom" />)).toContain('<svg')
  })

  // An unknown platform must render nothing rather than crash on an undefined element.
  it('renders nothing for an unknown platform', () => {
    expect(renderToStaticMarkup(<SocialIcon platform="myspace" />)).toBe('')
  })
})
