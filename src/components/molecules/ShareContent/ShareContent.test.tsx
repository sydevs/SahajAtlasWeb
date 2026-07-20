import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi, afterEach } from 'vitest'

import { ShareContent } from './ShareContent'

// Mock the i18n boundary so aria-labels render as real copy — including the
// %{platform} interpolation — without booting i18next (see NearbyPrompt.test).
// Node lane, no jsdom (.claude/rules/tests.md). navigator has no `.share` here,
// so ShareContent renders the grid; the last case stubs it to test the native path.
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

// A non-ASCII path so the double-encode regression is observable: encodeURI would
// have turned "café" into "caf%C3%A9".
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

  it('leads with a single native share button when the Web Share API is available', () => {
    vi.stubGlobal('navigator', { share: () => Promise.resolve() })

    const html = renderToStaticMarkup(<ShareContent country="RU" label={label} url={url} />)

    // Native-first: one "Share…" button opens the OS sheet — not the platform grid.
    expect(html).toContain('Share…')
    expect(html).not.toContain('Share on VK')
  })
})
