import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

import { ImageGallery, type Slide } from './ImageGallery'

// Node-only SSR assertions (see `docs/testing.md`). The lightbox is a closed portal here, so it
// renders nothing; `ImageGallery.lightbox.test.tsx` drives it in jsdom.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { dir: () => 'ltr' } }),
}))

const slides: Slide[] = [
  { src: 'https://example.test/a.jpg', alt: 'A' },
  { src: 'https://example.test/b.jpg' },
  { src: 'https://example.test/c.jpg', alt: 'C' },
]

describe('ImageGallery', () => {
  it('lays several images out as a two-column masonry of rounded tiles', () => {
    const html = renderToStaticMarkup(<ImageGallery slides={slides} />)

    expect(html).toMatch(/^<div class="columns-2 /)
    const tiles = html.match(/<button [^>]*>/g) ?? []

    expect(tiles).toHaveLength(3)
    for (const tile of tiles) {
      // Rounded, and never split across the two columns.
      expect(tile).toMatch(/\brounded-lg\b/)
      expect(tile).toMatch(/\bbreak-inside-avoid\b/)
    }
    expect(html.match(/<img /g)).toHaveLength(3)
  })

  it('names each tile by its alt text, or the generic label when it has none', () => {
    const html = renderToStaticMarkup(<ImageGallery slides={slides} />)

    expect(html).toContain('aria-label="A"')
    expect(html).toContain('aria-label="event.a11y.view_photo"')
  })

  it('opts every tile out of vaul dragging, or touch taps would be swallowed', () => {
    const html = renderToStaticMarkup(<ImageGallery slides={slides} />)

    expect(html.match(/data-vaul-no-drag/g)).toHaveLength(3)
  })

  it('gives a single image the full width, with no columns', () => {
    const html = renderToStaticMarkup(<ImageGallery slides={[slides[0]]} />)

    expect(html).toContain('<img')
    expect(html).not.toContain('columns-2')
  })

  it('renders nothing at all with no slides', () => {
    expect(renderToStaticMarkup(<ImageGallery slides={[]} />)).toBe('')
  })
})
