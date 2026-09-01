import { readFileSync } from 'node:fs'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { CompactEmbedView } from './CompactEmbedView'

// Node-only SSR assertions (`CLAUDE.md § Testing`). What matters here is what a visitor
// reads off it: the one control has to name the TASK rather than the product, both because that
// is the accessible name and because the atlas has to read as the host's own events feature.
//
// `t` resolves through the real `en/common.json` rather than echoing keys back, so these are
// about the copy that actually ships — and a key deleted from the bundle fails here instead of
// rendering as its own dotted name on somebody's page.
const en = JSON.parse(readFileSync('public/locales/en/common.json', 'utf8'))
const copy = (key: string): string =>
  key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en) as string

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => copy(key) ?? key }),
}))

// The view takes the whole decision `decideSlot` reached, so the specs build one.
const overlay = { action: { kind: 'overlay' }, autoOpen: false } as const
const link = {
  action: { kind: 'link', href: 'https://wemeditate.com/map' },
  autoOpen: false,
} as const

describe('CompactEmbedView', () => {
  it('names the task, not the product', () => {
    const html = renderToStaticMarkup(<CompactEmbedView compact={overlay}>{null}</CompactEmbedView>)

    expect(html).toContain(copy('compact.open'))
    expect(copy('compact.open')).toMatch(/find a class/i)
  })

  it('carries no brand string', () => {
    // The #158 ratchet, at the one control most likely to forget it.
    expect(
      renderToStaticMarkup(<CompactEmbedView compact={overlay}>{null}</CompactEmbedView>),
    ).not.toMatch(/sahaj\s*atlas|we ?meditate/i)
  })

  it('renders a real button for the in-place overlay', () => {
    const html = renderToStaticMarkup(<CompactEmbedView compact={overlay}>{null}</CompactEmbedView>)

    expect(html).toContain('<button')
    expect(html).not.toContain('<a ')
  })

  it('renders an anchor to the fallback for a framed embed', () => {
    // An anchor rather than a button that calls `window.open`: middle-click, "open in new tab"
    // and a visible target all come free, and it inherits the `Button` atom's `isSafeHref` gate
    // rather than adding a fourth JSX anchor to the inventory `href.test.ts` pins.
    const html = renderToStaticMarkup(<CompactEmbedView compact={link}>{null}</CompactEmbedView>)

    expect(html).toContain('href="https://wemeditate.com/map"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('previews no events, and so reads nothing', () => {
    // Rows cost a feed read, a titles read and a third-party IP lookup on every page view of a
    // sidebar embed nobody scrolls to, and were sized by a per-row pixel estimate that a wrapped
    // title or a larger default font made wrong. Asserted as ABSENCE so they cannot creep back.
    const html = renderToStaticMarkup(<CompactEmbedView compact={overlay}>{null}</CompactEmbedView>)

    expect(html).not.toContain('<ul')
    expect(html).not.toContain('<li')
  })

  it('never stretches to fill the slot', () => {
    // It takes the height its content needs, in the host's own flow, whatever box they gave.
    // Filling is wrong in both directions: against an element with no height `h-full` resolves
    // to nothing and the view collapses to invisible; against a tall one it stretches a two-line
    // card down 600px of empty background.
    //
    // Asserted on class TOKENS, not with `toContain`. An earlier version joined the list with a
    // template literal, prettier-plugin-tailwindcss ate the leading space, and it shipped as
    // `text-foregroundh-full` — a class present in the DOM matching no rule, with every gate
    // green. A substring assertion passes on that string.
    const classes = (
      renderToStaticMarkup(<CompactEmbedView compact={overlay}>{null}</CompactEmbedView>).match(
        /class="([^"]*)"/,
      )?.[1] ?? ''
    ).split(/\s+/)

    expect(classes).not.toContain('h-full')
    expect(classes).not.toContain('h-screen')
  })
})
