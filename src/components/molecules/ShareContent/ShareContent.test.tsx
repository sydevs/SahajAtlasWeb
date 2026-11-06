import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi, afterEach } from 'vitest'

import { CopyField, ShareContent } from './ShareContent'

// This mocks the i18n boundary, so aria-labels render as real copy,
// including the %{platform} interpolation, without booting i18next (see
// GeolocationPrompt.test). This is the node lane, with no jsdom
// (docs/testing.md). `navigator` has no `.share` here, so ShareContent
// renders the grid. The last case stubs it, to test the native path.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { platform?: string }) =>
      key === 'share.share_on'
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
  it('orders the share grid to the viewer region', () => {
    const ru = renderToStaticMarkup(<ShareContent country="RU" label={label} url={url} />)

    expect(ru).toContain('Share on VK')
    expect(ru).toContain('Share on OK.ru')
    expect(ru).not.toContain('Share on LINE')

    const jp = renderToStaticMarkup(<ShareContent country="JP" label={label} url={url} />)

    expect(jp).toContain('Share on LINE')
    expect(jp).not.toContain('Share on VK')
  })

  it('falls back to the default platforms for an unknown or absent country', () => {
    const html = renderToStaticMarkup(<ShareContent label={label} url={url} />)

    // DEFAULT_PLATFORMS leads with WhatsApp and carries no regional-only targets.
    expect(html).toContain('Share on WhatsApp')
    expect(html).not.toContain('Share on VK')
    expect(html).not.toContain('Share on LINE')
  })

  it('copies the raw URL — react-share encodes internally, so no double-encoding', () => {
    const html = renderToStaticMarkup(<ShareContent label={label} url={url} />)

    expect(html).toContain('café')
    expect(html).not.toContain('caf%C3%A9')
  })

  it('offers a named copy button, with the raw URL as a caption under it', () => {
    const html = renderToStaticMarkup(<ShareContent label={label} url={url} />)

    expect(html).toContain('share.copy_link')
    expect(html.indexOf('share.copy_link')).toBeLessThan(html.indexOf(url))
  })

  it('leads with a single native share button when the Web Share API is available', () => {
    vi.stubGlobal('navigator', { share: () => Promise.resolve() })

    const html = renderToStaticMarkup(<ShareContent country="RU" label={label} url={url} />)

    // Native-first: one "Share…" button opens the OS sheet, not the platform grid.
    expect(html).toContain('Share…')
    expect(html).not.toContain('Share on VK')
  })
})

// The class page's contact popover copies a phone number with this. Named "Copy link", it told
// a screen-reader user it would copy something it does not (Browser M9).
describe('CopyField', () => {
  const phone = '020 7946 0000'
  const html = renderToStaticMarkup(
    <CopyField
      copiedLabel="Phone number copied"
      label={`Copy phone number ${phone}`}
      value={phone}
    />,
  )

  it('is named for what it copies, with the value it shows in its name', () => {
    expect(html).toContain(`aria-label="Copy phone number ${phone}"`)
    expect(html).not.toContain('share.copy_link')
  })

  it('keeps its announcement for after it has copied', () => {
    expect(html).toContain('aria-live="polite"')
    expect(html).not.toContain('Phone number copied')
  })
})
