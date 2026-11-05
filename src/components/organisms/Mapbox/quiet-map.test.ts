import type { MapRef } from 'react-map-gl'

import { describe, expect, it, vi } from 'vitest'

import { basemapPaint, BASEMAP_PALETTES, registerBasemap } from './quiet-map'

const fakeMap = (layers: string[]) => {
  const handlers = new Map<string, () => void>()
  const setPaintProperty = vi.fn()
  const map = {
    getLayer: (id: string) => (layers.includes(id) ? { id } : undefined),
    getMap: () => ({ setPaintProperty }),
    on: (event: string, handler: () => void) => handlers.set(event, handler),
    off: (event: string) => handlers.delete(event),
  } as unknown as MapRef

  return { map, handlers, setPaintProperty }
}

describe('quiet basemap', () => {
  it('keeps dark land above its sea, so the map does not glow', () => {
    const lightness = (hex: string) => parseInt(hex.slice(1, 3), 16)

    expect(lightness(BASEMAP_PALETTES.dark.land)).toBeGreaterThan(
      lightness(BASEMAP_PALETTES.dark.water),
    )
    expect(lightness(BASEMAP_PALETTES.dark.land)).toBeLessThan(0x40)
  })

  it('paints only the layers the style has, with no fade', () => {
    const { map, setPaintProperty } = fakeMap(['water'])

    registerBasemap(map, 'light')

    expect(setPaintProperty).toHaveBeenCalledWith('water', 'fill-color', '#CFDFE2')
    expect(setPaintProperty).toHaveBeenCalledWith('water', 'fill-color-transition', {
      duration: 0,
      delay: 0,
    })
    expect(setPaintProperty.mock.calls.every(([layer]) => layer === 'water')).toBe(true)
  })

  it('paints again on each new style until unsubscribed', () => {
    const { map, handlers, setPaintProperty } = fakeMap(['land'])
    const stop = registerBasemap(map, 'dark')

    setPaintProperty.mockClear()
    handlers.get('style.load')?.()
    expect(setPaintProperty).toHaveBeenCalledWith('land', 'background-color', '#20272A')

    stop()
    expect(handlers.has('style.load')).toBe(false)
  })

  it('covers every palette role in both themes', () => {
    expect(basemapPaint('light').length).toBe(basemapPaint('dark').length)
  })
})
