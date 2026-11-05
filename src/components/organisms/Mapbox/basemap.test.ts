import type { MapRef } from 'react-map-gl'

import { describe, expect, it, vi } from 'vitest'

import { DARK_WARM_PAINT, warmBasemap } from './basemap'

// A stand-in for the react-map-gl ref: just the calls `warmBasemap` makes. `layers` is
// the set of layer ids the loaded style carries.
const fakeMap = ({ loaded = true, layers = Object.keys(DARK_WARM_PAINT) } = {}) => {
  const handlers = new Set<() => void>()
  const setPaintProperty = vi.fn()
  const gl = {
    getLayer: (id: string) => (layers.includes(id) ? { id } : undefined),
    setPaintProperty,
  }
  const map = {
    getMap: () => gl,
    isStyleLoaded: () => loaded,
    on: (_event: string, handler: () => void) => handlers.add(handler),
    off: (_event: string, handler: () => void) => handlers.delete(handler),
  }

  return {
    map: map as unknown as MapRef,
    setPaintProperty,
    loadStyle: () => handlers.forEach((handler) => handler()),
    handlers,
  }
}

describe('warmBasemap', () => {
  it('leaves the light basemap alone', () => {
    const { map, setPaintProperty, handlers } = fakeMap()

    warmBasemap(map, 'light')

    expect(setPaintProperty).not.toHaveBeenCalled()
    expect(handlers.size).toBe(0)
  })

  it('repaints the dark basemap at once when its style is already loaded', () => {
    const { map, setPaintProperty } = fakeMap()

    warmBasemap(map, 'dark')

    expect(setPaintProperty).toHaveBeenCalledWith(
      'land',
      'background-color',
      DARK_WARM_PAINT.land['background-color'],
    )
  })

  it('repaints again after a style load, and stops once unsubscribed', () => {
    const { map, setPaintProperty, loadStyle } = fakeMap({ loaded: false })
    const stop = warmBasemap(map, 'dark')

    expect(setPaintProperty).not.toHaveBeenCalled()
    loadStyle()
    expect(setPaintProperty).toHaveBeenCalled()

    setPaintProperty.mockClear()
    stop()
    loadStyle()
    expect(setPaintProperty).not.toHaveBeenCalled()
  })

  it('skips a layer the style no longer carries', () => {
    const { map, setPaintProperty } = fakeMap({ layers: ['water'] })

    warmBasemap(map, 'dark')

    expect(setPaintProperty).toHaveBeenCalledTimes(1)
    expect(setPaintProperty).toHaveBeenCalledWith('water', 'fill-color', expect.any(String))
  })
})
