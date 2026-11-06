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
        'countries.near_city': `Classes near ${opts?.city}`,
        'search.nearby_prompt.dismiss': 'Dismiss',
      })[key] ?? key,
  }),
}))

const noop = () => {}

describe('GeolocationPrompt', () => {
  it('frames the guessed city as a suggestion, not a definitive location', () => {
    const html = renderToStaticMarkup(
      <GeolocationPrompt city="Paris" onAccept={noop} onClose={noop} />,
    )

    expect(html).toContain('Classes near Paris')
    expect(html).not.toContain('your location')
  })

  it('renders the suggestion text as a real button (keyboard accessible)', () => {
    const html = renderToStaticMarkup(
      <GeolocationPrompt city="Berlin" onAccept={noop} onClose={noop} />,
    )

    expect(html).toContain('<button')
    expect(html).toContain('Classes near Berlin')
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

  it('is a full-width light-blue band on the panel edges, vertically centred', () => {
    const html = renderToStaticMarkup(
      <GeolocationPrompt city="Paris" onAccept={noop} onClose={noop} />,
    )

    // Today's blue tint, which Anton preferred to the sand box (6 Nov).
    expect(html).toContain('bg-secondary-3')
    // Never the coral tint: a pink band reads like an error.
    expect(html).not.toContain('bg-contrast-3')
    // Edge to edge, with its content on the panel's 16px edge: no inset box.
    expect(html).toContain('px-4')
    expect(html).toContain('rounded-none')
    expect(html).not.toContain('mx-4')
    expect(html).toContain('items-center')
  })

  it('offers one thing only: no second link out to a country website', () => {
    const html = renderToStaticMarkup(
      <GeolocationPrompt city="Prague" onAccept={noop} onClose={noop} />,
    )

    expect(html).not.toContain('<a ')
    expect(html).not.toContain('search.country_site.cta')
  })
})
