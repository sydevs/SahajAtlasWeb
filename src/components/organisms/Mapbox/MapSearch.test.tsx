import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { MapSearch } from './MapSearch'

// The geocoder is a custom element whose options are set in an effect, so its SSR markup says
// nothing. This stands in at the vendor boundary and prints what our component hands it.
vi.mock('@mapbox/search-js-react', () => ({
  Geocoder: ({ options, value }: { options: unknown; value: string }) => (
    <output data-options={JSON.stringify(options)} data-value={value} />
  ),
}))
vi.mock('react-map-gl', () => ({
  useMap: () => ({ mapbox: { getCenter: () => ({ lng: 9, lat: 9 }), getMap: () => undefined } }),
}))
vi.mock('@/config/i18n', () => ({ default: { resolvedLanguage: 'en' } }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', resolvedLanguage: 'en', on: () => {}, off: () => {} },
  }),
}))

const render = (ui: JSX.Element, url = '/?q=from-the-url') => {
  const html = renderToStaticMarkup(<MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>)
  const attribute = (name: string) =>
    (new RegExp(`${name}="([^"]*)"`).exec(html)?.[1] ?? '').replaceAll('&quot;', '"')

  return { options: JSON.parse(attribute('data-options') || '{}'), value: attribute('data-value') }
}

describe('MapSearch', () => {
  it('biases suggestions toward the map centre by default, with every type offered', () => {
    const { options, value } = render(<MapSearch onSelect={() => {}} />)

    expect(options.proximity).toEqual({ lng: 9, lat: 9 })
    expect(options).not.toHaveProperty('types')
    expect(value).toBe('from-the-url')
  })

  it('starts near the place it is given, and narrows to the types asked for', () => {
    // The add-a-class flow opened from a region passes that region's centre (#147).
    const { options } = render(
      <MapSearch proximity={{ lng: -0.12, lat: 51.5 }} types="place" onSelect={() => {}} />,
    )

    expect(options.proximity).toEqual({ lng: -0.12, lat: 51.5 })
    expect(options.types).toBe('place')
  })

  it('seeds a form field from its own value, never from the search in the URL', () => {
    expect(
      render(<MapSearch query={{ initial: '10 Downing St' }} onSelect={() => {}} />).value,
    ).toBe('10 Downing St')
  })

  it('still shows the search in the URL when it may not write it', () => {
    expect(render(<MapSearch query="read-only" onSelect={() => {}} />).value).toBe('from-the-url')
  })
})
