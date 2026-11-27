import type { EventImage } from '@/types'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

import { ImageGallery } from './ImageGallery'

// Node-only SSR assertions (see `docs/testing.md`). The lightbox is a closed portal here, so it
// renders nothing; `ImageGallery.lightbox.test.tsx` drives it in jsdom.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { dir: () => 'ltr' } }),
}))

const images: EventImage[] = [
  { url: 'https://example.test/a.jpg', alt: 'A' },
  { url: 'https://example.test/b.jpg' },
  { url: 'https://example.test/c.jpg', alt: 'C' },
]

describe('ImageGallery', () => {
  it('lays several images out as a two-column masonry of rounded tiles', () => {
    const html = renderToStaticMarkup(<ImageGallery images={images} />)

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

  it('sizes each image from its stored dimensions, so the tile holds its box before it loads', () => {
    const html = renderToStaticMarkup(
      <ImageGallery images={[{ ...images[0], width: 1200, height: 800 }, images[1]]} />,
    )

    expect(html).toMatch(/<img[^>]*height="800"[^>]*width="1200"/)
    // An image with no stored size still renders, at its natural size once loaded.
    expect(html.match(/<img [^>]*>/g)?.[1]).not.toContain('width=')
  })

  it('names each tile by its alt text, or the generic label when it has none', () => {
    const html = renderToStaticMarkup(<ImageGallery images={images} />)

    expect(html).toContain('aria-label="A"')
    expect(html).toContain('aria-label="event.a11y.view_photo"')
  })

  it('opts every tile out of vaul dragging, or touch taps would be swallowed', () => {
    const html = renderToStaticMarkup(<ImageGallery images={images} />)

    expect(html.match(/data-vaul-no-drag/g)).toHaveLength(3)
  })

  it('gives a single image the full width, with no columns', () => {
    const html = renderToStaticMarkup(<ImageGallery images={[images[0]]} />)

    expect(html).toContain('<img')
    expect(html).not.toContain('columns-2')
  })

  it('skips an image with no file, and renders nothing when none has one', () => {
    const html = renderToStaticMarkup(
      <ImageGallery images={[images[0], { url: null, alt: 'X' }]} />,
    )

    expect(html.match(/<img /g)).toHaveLength(1)
    expect(html).not.toContain('columns-2')
    expect(renderToStaticMarkup(<ImageGallery images={[{ url: null }]} />)).toBe('')
    expect(renderToStaticMarkup(<ImageGallery images={[]} />)).toBe('')
  })
})
