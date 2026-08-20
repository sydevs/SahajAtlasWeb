import { readFileSync } from 'node:fs'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { CompactCard } from './CompactCard'

// Node-only SSR assertions (`.claude/rules/tests.md`). What matters about this card is what a
// visitor reads off it: the one control has to name the TASK rather than the product, both
// because that is the accessible name and because the atlas has to read as the host's own
// events feature (#158).
//
// `t` resolves through the real `en/common.json` rather than echoing keys back, so the
// assertions below are about the copy that actually ships — and a key deleted from the bundle
// fails here instead of rendering as its own dotted name on somebody's page.
const en = JSON.parse(readFileSync('public/locales/en/common.json', 'utf8'))
const copy = (key: string): string =>
  key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en) as string

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => copy(key) ?? key }),
}))

const overlay = { kind: 'overlay', onOpen: () => {} } as const
const link = { kind: 'link', href: 'https://wemeditate.com/map' } as const

describe('CompactCard', () => {
  it('names the task, not the product', () => {
    const html = renderToStaticMarkup(<CompactCard action={overlay} fill />)

    expect(html).toContain(copy('compact.open'))
    expect(copy('compact.open')).toMatch(/find a class/i)
  })

  it('carries no brand string', () => {
    // The #158 ratchet, at the one control most likely to forget it.
    const html = renderToStaticMarkup(<CompactCard action={overlay} fill />)

    expect(html).not.toMatch(/sahaj\s*atlas|we ?meditate/i)
  })

  it('renders a real button for the in-page overlay', () => {
    const html = renderToStaticMarkup(<CompactCard action={overlay} fill />)

    expect(html).toContain('<button')
    expect(html).not.toContain('<a ')
  })

  it('renders an anchor to the fallback for a framed embed', () => {
    // An anchor rather than a button that calls `window.open`: middle-click, "open in new tab"
    // and a visible target all come free, and it inherits the `Button` atom's `isSafeHref`
    // gate rather than adding a fourth JSX anchor to the inventory `href.test.ts` pins.
    const html = renderToStaticMarkup(<CompactCard action={link} fill />)

    expect(html).toContain('href="https://wemeditate.com/map"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('previews no events, and so reads nothing', () => {
    // The card is the button. Rows cost a feed read, a titles read and a third-party IP lookup
    // on every page view of a sidebar embed nobody scrolls to, and were sized by a per-row
    // pixel estimate that a wrapped title or a larger default font made wrong. Asserted as
    // ABSENCE so a row cannot creep back without turning this red.
    const html = renderToStaticMarkup(<CompactCard action={overlay} fill />)

    expect(html).not.toContain('<ul')
    expect(html).not.toContain('<li')
  })

  it('fills a box the host sized, and takes content height when they gave none', () => {
    // `h-full` against a host who gave no height resolves to nothing, so the card would
    // collapse and read as an embed that did not render.
    expect(renderToStaticMarkup(<CompactCard action={overlay} fill />)).toContain('h-full')
    expect(renderToStaticMarkup(<CompactCard action={overlay} fill={false} />)).not.toContain(
      'h-full',
    )
  })
})
