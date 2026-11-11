// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it } from 'vitest'

import { NO_BRAND_PALETTE, useBrandPalette } from '@/config/theme/brand-palette'
import { BrandTheme } from '@/config/theme/BrandTheme'
import { type PaletteRoles } from '@/config/theme/palette'
import { readRepoSource } from '@/test-support/repo-source'

/**
 * `BrandTheme` paints the palette as CSS variables and hands the same resolved roles
 * down the tree, because the map cannot read the variables.
 *
 * jsdom, because the paint IS a layout effect: an SSR render runs no effects at all.
 * Two halves of one resolution drifting apart is exactly the wiring defect a pure
 * spec cannot see — the UI would stay branded while the pins reverted to teal, with
 * every gate green.
 */

let cleanup: (() => void) | null = null
let seen: PaletteRoles[] = []

afterEach(() => {
  cleanup?.()
  cleanup = null
  seen = []
  document.documentElement.removeAttribute('style')
})

function Probe() {
  seen.push(useBrandPalette())

  return null
}

function mount(palette: Parameters<typeof BrandTheme>[0]['palette']) {
  const host = document.createElement('div')

  document.body.append(host)

  const root = createRoot(host)
  const render = (next: typeof palette) =>
    act(() =>
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <BrandTheme palette={next}>
            <Probe />
          </BrandTheme>
        </QueryClientProvider>,
      ),
    )

  render(palette)
  cleanup = () => act(() => root.unmount())

  return render
}

describe('BrandTheme', () => {
  it('hands down the roles it painted from', () => {
    mount({ primary: '#64032e', contrast: '#1E6C71' })

    expect(seen.at(-1)).toMatchObject({ primary: '#64032e', contrast: '#1E6C71' })
    // The paint and the value come from one resolution, so this asserts both.
    expect(document.documentElement.style.getPropertyValue('--primary-9')).toBe('333 60% 20%')
  })

  it('substitutes no default for an unconfigured role', () => {
    mount(undefined)

    // An unseeded role must reach the map as absent, which is what keeps the stock
    // pins stock. Filling in `DEFAULT_SEEDS` here would recolor every unbranded
    // embed, and make its pins mode-dependent.
    expect(Object.values(seen.at(-1) ?? {}).every((seed) => seed === undefined)).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--primary-9')).toBe('')
  })

  it('hands down the same object while the seeds do not change', () => {
    const render = mount({ primary: '#64032e' })

    render({ primary: '#64032e' })

    // The map memoises its marker colors on this identity and re-registers its four
    // images when it changes, so a fresh object per render would cost a branded embed
    // a re-registration on every unrelated re-render above it.
    expect(seen.length).toBeGreaterThan(1)
    expect(seen.at(-1)).toBe(seen[0])
  })

  it('renders a subtree with no BrandTheme above it unbranded', () => {
    const host = document.createElement('div')

    document.body.append(host)

    const root = createRoot(host)

    act(() => root.render(<Probe />))
    cleanup = () => act(() => root.unmount())

    // By identity, for the same reason as above: this is every story and spec that
    // renders the map without a tenant.
    expect(seen.at(-1)).toBe(NO_BRAND_PALETTE)
  })
})

/**
 * The JOIN, pinned in source as `Widget.theme-root.test.tsx` pins its own:
 * everything above proves the context carries the palette, and none of it proves
 * the map still reads it. Rendering `Mapbox` here would need a token, a GeoJSON
 * feed and WebGL for three lines of wiring.
 */
describe('the wiring', () => {
  it('is what Map.tsx does with the palette', () => {
    const source = readRepoSource('src/components/organisms/Mapbox/Map.tsx')

    expect(source).toContain('useBrandPalette()')
    expect(source).toContain('markerColors(palette, theme)')
    // The mode too: the art's outline is fixed per basemap, and `markerColors`
    // carries no mode for an unbranded embed.
    expect(source).toContain('registerMarkerImages(mapbox, colors, theme)')
    // The colors are a dependency, so a palette change re-registers. Asserted as
    // its own literal rather than one regex spanning both, which would also pin
    // the whitespace between them — Prettier's to choose, not this spec's.
    expect(source).toContain('}, [mapbox, colors, theme])')
  })
})
