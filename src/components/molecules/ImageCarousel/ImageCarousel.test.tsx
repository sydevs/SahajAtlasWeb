import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

import { ImageCarousel, type Slide } from './ImageCarousel'

// Node-only SSR assertions (see `CLAUDE.md § Testing`). What this pins is the
// WCAG 2.2.2 contract from issue #104: a carousel that moves on its own must
// ship a way to stop it, and a static one must NOT grow a control for motion it
// never had. Whether pressing it actually halts Swiper is a live-instance
// question the SSR markup can't answer — that is verified in the browser.
//
// `usePrefersReducedMotion` is left unmocked on purpose: it answers "motion is
// allowed" here without touching `window` (see its docblock), so these run in
// the node lane AND the lane would notice if that ever stopped being true.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const slides: Slide[] = [
  { src: 'https://example.test/a.jpg', alt: 'A' },
  { src: 'https://example.test/b.jpg', alt: 'B' },
]

describe('ImageCarousel', () => {
  it('offers a localized, pressable pause control when the carousel autoplays', () => {
    const html = renderToStaticMarkup(<ImageCarousel slides={slides} />)

    expect(html).toContain('aria-label="details.pause_slideshow"')
    // A toggle button: the name stays put and the state rides on aria-pressed,
    // which starts unpressed because the carousel starts playing.
    expect(html).toContain('aria-pressed="false"')
  })

  it('opts the control out of vaul dragging, or touch taps would be swallowed', () => {
    // The carousel renders on the drawer, where vaul reads a tap with any
    // micro-movement as a drag and eats the click. Losing this attribute breaks
    // the control on touch only — invisible to every other gate, so it is pinned
    // here rather than trusted to review.
    expect(renderToStaticMarkup(<ImageCarousel slides={slides} />)).toContain('data-vaul-no-drag')
  })

  it('renders no pause control for a single slide, which never autoplays', () => {
    const html = renderToStaticMarkup(<ImageCarousel slides={[slides[0]]} />)

    expect(html).toContain('<img')
    expect(html).not.toContain('details.pause_slideshow')
    expect(html).not.toContain('aria-pressed')
  })

  it('renders nothing at all with no slides', () => {
    expect(renderToStaticMarkup(<ImageCarousel slides={[]} />)).toBe('')
  })
})
