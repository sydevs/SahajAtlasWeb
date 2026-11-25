import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { QrCode, QrPoster } from './QrPoster'

// Mock the i18n boundary, so each string renders as its key (node lane, no jsdom; see
// docs/testing.md).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const URL = 'https://wemeditate.com/map/gb/south-east/london/balham-library/1392'
const MATRIX = [
  [true, false],
  [false, true],
]

describe('QrPoster', () => {
  it('renders a closed row and no code', () => {
    const html = renderToStaticMarkup(<QrPoster label="Evening Meditation" url={URL} />)

    expect(html).toContain('share.qr_title')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('<svg role="img"')
    expect(html).not.toContain('share.qr_download')
  })
})

describe('QrCode', () => {
  it('draws the code black on white, whatever the theme, with the hint and the download', () => {
    const html = renderToStaticMarkup(
      <QrCode initial={{ status: 'ready', matrix: MATRIX }} label="Evening Meditation" url={URL} />,
    )

    expect(html).toContain('bg-white')
    expect(html).toContain('fill="#000"')
    expect(html).not.toMatch(/dark:bg-/)
    expect(html).toContain('aria-label="share.a11y.qr_code"')
    expect(html).toContain('share.qr_hint')
    expect(html).toContain('share.qr_download')
  })

  it('says the code failed instead of drawing a broken one', () => {
    const html = renderToStaticMarkup(
      <QrCode initial={{ status: 'failed' }} label="Evening Meditation" url={URL} />,
    )

    expect(html).toContain('role="alert"')
    expect(html).toContain('share.qr_failed')
    expect(html).not.toContain('role="img"')
  })
})
