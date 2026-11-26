import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi, afterEach } from 'vitest'

import { ShareContent } from './ShareContent'
import { ShareTargets } from './platform-buttons'

// This mocks the i18n boundary, so aria-labels render as real copy,
// including the %{platform} interpolation, without booting i18next (see
// GeolocationPrompt.test). This is the node lane, with no jsdom
// (docs/testing.md), so the popover itself never opens here: `ShareTargets`
// is rendered directly for what it holds, and `ShareContent.dom.test.tsx`
// drives the button.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { platform?: string }) =>
      key === 'share.a11y.share_on'
        ? `Share on ${opts?.platform}`
        : key === 'share.native'
          ? 'Share…'
          : key,
  }),
}))

afterEach(() => {
  vi.unstubAllGlobals()
})

// A non-ASCII path makes the double-encode regression observable.
// encodeURI would have turned "café" into "caf%C3%A9".
const url = 'https://atlas.example/e/café'
const label = 'Saturday Morning Meditation'

describe('ShareContent', () => {
  // The fallback targets live in the Share button's popover, not in a grid under Copy link.
  it.each([
    ['without a share sheet', undefined],
    ['with a share sheet', () => Promise.resolve()],
  ])('leads with one Share button %s, the targets behind it', (_, share) => {
    if (share) vi.stubGlobal('navigator', { share })

    const html = renderToStaticMarkup(<ShareContent country="RU" label={label} url={url} />)

    expect(html).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>.*Share…/)
    expect(html.indexOf('Share…')).toBeLessThan(html.indexOf('share.copy_link'))
    expect(html).not.toContain('Share on VK')
  })

  it('copies the raw URL — react-share encodes internally, so no double-encoding', () => {
    const html = renderToStaticMarkup(<ShareContent label={label} url={url} />)

    expect(html).toContain('café')
    expect(html).not.toContain('caf%C3%A9')
  })

  it('offers a named Copy link button, with the raw URL as a caption under it', () => {
    const html = renderToStaticMarkup(<ShareContent label={label} url={url} />)

    expect(html).toMatch(/<button[^>]*>.*share\.copy_link<\/button>/)
    expect(html.indexOf('share.copy_link')).toBeLessThan(html.indexOf(url))
  })

  // One block for the class's Share panel and the registration confirmation: the poster code
  // is the class page's own row.
  it('holds no QR code', () => {
    expect(renderToStaticMarkup(<ShareContent label={label} url={url} />)).not.toContain(
      'share.qr_title',
    )
  })
})

describe('ShareTargets', () => {
  it('picks and orders the targets to the viewer region', () => {
    const ru = renderToStaticMarkup(<ShareTargets country="RU" title={label} url={url} />)

    expect(ru.indexOf('Share on VK')).toBeLessThan(ru.indexOf('Share on OK.ru'))
    expect(ru).not.toContain('Share on LINE')

    const jp = renderToStaticMarkup(<ShareTargets country="JP" title={label} url={url} />)

    expect(jp).toContain('Share on LINE')
    expect(jp).not.toContain('Share on VK')
  })

  it('falls back to the default platforms for an unknown or absent country', () => {
    const html = renderToStaticMarkup(<ShareTargets title={label} url={url} />)

    // DEFAULT_PLATFORMS leads with WhatsApp and carries no regional-only targets.
    expect(html).toContain('Share on WhatsApp')
    expect(html).not.toContain('Share on VK')
    expect(html).not.toContain('Share on LINE')
  })

  // A person finds their app by its colour, so no neutral repaint.
  it('keeps each network in its brand colours', () => {
    const html = renderToStaticMarkup(<ShareTargets title={label} url={url} />)

    expect(html).toContain('fill="#25D366"')
  })

  it('rings X alone in dark mode, the one black disc', () => {
    const html = renderToStaticMarkup(<ShareTargets country="US" title={label} url={url} />)
    const ringed = [...html.matchAll(/<button[^>]*>/g)]
      .map(([tag]) => tag)
      .filter((tag) => tag.includes('dark:ring-1'))
      .map((tag) => tag.match(/aria-label="([^"]+)"/)?.[1])

    expect(ringed).toEqual(['Share on X'])
  })
})
