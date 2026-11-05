import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

import { QrPoster } from './QrPoster'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

describe('QrPoster', () => {
  it('starts closed, as one labelled row with no code drawn', () => {
    const html = renderToStaticMarkup(<QrPoster label="A class" url="https://example.org/1" />)

    expect(html).toContain('share.qr_title')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('<path d="M')
    expect(html).not.toContain('share.qr_download')
  })
})
