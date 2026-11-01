// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it } from 'vitest'

import { useBrandPalette } from '@/config/theme/brand-palette'
import { BrandTheme } from '@/config/theme/BrandTheme'
import { readRepoSource } from '@/test-support/repo-source'

/**
 * `BrandTheme` paints the palette as CSS variables and publishes it to the store
 * in the same effect, because the map cannot read the variables.
 *
 * jsdom, because the publish IS a layout effect: there is no pure half, and an
 * SSR render runs no effects at all. Two halves of one resolution drifting apart
 * is exactly the wiring defect a pure spec cannot see — the UI would stay
 * branded while the pins reverted to teal, with every gate green.
 */

let cleanup: (() => void) | null = null

afterEach(() => {
  cleanup?.()
  cleanup = null
  useBrandPalette.setState({ palette: {} })
  document.documentElement.removeAttribute('style')
})

function mount(palette: Parameters<typeof BrandTheme>[0]['palette']) {
  const host = document.createElement('div')

  document.body.append(host)

  const root = createRoot(host)

  act(() =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <BrandTheme palette={palette}>{null}</BrandTheme>
      </QueryClientProvider>,
    ),
  )
  cleanup = () => act(() => root.unmount())
}

describe('BrandTheme', () => {
  it('publishes the roles it painted from', () => {
    mount({ primary: '#64032e', contrast: '#1E6C71' })

    expect(useBrandPalette.getState().palette).toMatchObject({
      primary: '#64032e',
      contrast: '#1E6C71',
    })
    // The paint and the publish come from one resolution, so this asserts both.
    expect(document.documentElement.style.getPropertyValue('--primary-9')).toBe('333 60% 20%')
  })

  it('publishes an empty palette when no role is configured', () => {
    // A distinguishable starting value, since `toEqual` reads an absent key and
    // an undefined one alike — against an already-empty store this assertion
    // would pass without any publish at all.
    useBrandPalette.setState({ palette: { primary: '#64032e' } })

    mount(undefined)

    // An unseeded role must reach the map as absent, which is what keeps the
    // stock pins stock.
    expect(useBrandPalette.getState().palette).toEqual({
      primary: undefined,
      secondary: undefined,
      contrast: undefined,
    })
    expect(document.documentElement.style.getPropertyValue('--primary-9')).toBe('')
  })
})

/**
 * The JOIN, pinned in source as `Widget.theme-root.test.tsx` pins its own:
 * everything above proves the store carries the palette, and none of it proves
 * the map still reads it. Rendering `Mapbox` here would need a token, a GeoJSON
 * feed and WebGL for three lines of wiring.
 */
describe('the wiring', () => {
  it('is what Map.tsx does with the published palette', () => {
    const source = readRepoSource('src/components/organisms/Mapbox/Map.tsx')

    expect(source).toContain('useBrandPalette((state) => state.palette)')
    expect(source).toContain('markerColors(palette, theme)')
    expect(source).toContain('registerMarkerImages(mapbox, colors)')
    // The colors are a dependency, so a palette change re-registers.
    expect(source).toMatch(/registerMarkerImages\(mapbox, colors\)\s*\n\s*\}, \[mapbox, colors\]\)/)
  })
})
