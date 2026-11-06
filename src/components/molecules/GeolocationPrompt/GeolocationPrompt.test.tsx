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

  it('matches the search field it hangs under: light blue, 8px corners, the field type size', () => {
    const html = renderToStaticMarkup(
      <GeolocationPrompt city="Paris" onAccept={noop} onClose={noop} />,
    )

    // Today's blue tint, which Anton preferred to sand (6 Nov).
    expect(html).toContain('bg-secondary-3')
    // Never the coral tint: a pink band reads like an error.
    expect(html).not.toContain('bg-contrast-3')
    // The field's corners and type size, so it reads as one of the field's suggestions.
    expect(html).toContain('rounded-lg')
    expect(html).toContain('field-size')
    expect(html).toContain('items-center')
  })

  it('offers one thing only: no second link out to a country website', () => {
    const html = renderToStaticMarkup(
      <GeolocationPrompt city="Prague" onAccept={noop} onClose={noop} />,
    )

    expect(html).not.toContain('<a ')
    expect(html).not.toContain('search.country_site.cta')
  })

  it('reads "Classes near me" with no × when there is no guess to dismiss', () => {
    const html = renderToStaticMarkup(<GeolocationPrompt label="Classes near me" onAccept={noop} />)

    expect(html).toContain('Classes near me')
    expect(html).not.toContain('aria-label="Dismiss"')
  })

  it('is busy while locating, and announces a failure at once', () => {
    const busy = renderToStaticMarkup(
      <GeolocationPrompt busy label="Finding your location…" onAccept={noop} />,
    )
    const failed = renderToStaticMarkup(
      <GeolocationPrompt alert label="We couldn't get your location." onAccept={noop} />,
    )

    expect(busy).toContain('disabled')
    expect(failed).toContain('role="alert"')
  })
})
