import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

import { GeolocationPrompt } from './GeolocationPrompt'

// This mocks the i18n boundary (react-i18next), so the SSR markup
// asserts on real copy, including the Ruby-style %{city} interpolation,
// without booting i18next. This is the node lane, with no jsdom (see docs/testing.md).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { city?: string }) =>
      ({
        'nearby_prompt.title': `Looking for classes near ${opts?.city}?`,
        'nearby_prompt.dismiss': 'Dismiss',
      })[key] ?? key,
  }),
}))

const noop = () => {}

describe('GeolocationPrompt', () => {
  it('frames the guessed city as a suggestion, not a definitive location', () => {
    const html = renderToStaticMarkup(
      <GeolocationPrompt city="Paris" onAccept={noop} onClose={noop} />,
    )

    expect(html).toContain('Looking for classes near Paris?')
    expect(html).not.toContain('your location')
  })

  it('renders the suggestion text as a real button (keyboard accessible)', () => {
    const html = renderToStaticMarkup(
      <GeolocationPrompt city="Berlin" onAccept={noop} onClose={noop} />,
    )

    expect(html).toContain('<button')
    expect(html).toContain('Looking for classes near Berlin?')
  })

  it('is a polite status with an accessible dismiss label — not an assertive alert', () => {
    const html = renderToStaticMarkup(
      <GeolocationPrompt city="Paris" onAccept={noop} onClose={noop} />,
    )

    expect(html).toContain('aria-label="Dismiss"')
    // A passive suggestion should not interrupt a screen reader.
    expect(html).toContain('role="status"')
    expect(html).not.toContain('role="alert"')
  })

  it('is a secondary-tinted, header-aligned, vertically-centred single line', () => {
    const html = renderToStaticMarkup(
      <GeolocationPrompt city="Paris" onAccept={noop} onClose={noop} />,
    )

    expect(html).toContain('bg-secondary-3')
    expect(html).toContain('items-center')
    // This aligns the horizontal padding with the drawer header (px-4).
    expect(html).toContain('px-4')
  })
})
