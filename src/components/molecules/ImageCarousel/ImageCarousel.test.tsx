import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

import { ImageCarousel, type Slide } from './ImageCarousel'

// Node-only SSR assertions (see `.claude/rules/tests.md`). What this pins is the
// WCAG 2.2.2 contract from issue #104: a carousel that moves on its own must
// ship a way to stop it, and a static one must NOT grow a control for motion it
// never had. Whether pressing it actually halts Swiper is a live-instance
// question the SSR markup can't answer — that is verified in the browser.
//
// The reduced-motion read is a `useSyncExternalStore` whose server snapshot is
// `false`, so these render as "motion is allowed" and never touch `window`.
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
