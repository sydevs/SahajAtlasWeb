import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A stand-in for mapbox-gl: it counts its own evaluations, and its support check refuses a strict
// request whenever `gpu` says the browser would draw in software.
const mapbox = { evaluations: 0, gpu: 'hardware' as 'hardware' | 'software' }

const fakeMapboxGl = () => {
  mapbox.evaluations += 1

  const supported = (failIfMajorPerformanceCaveat?: boolean) =>
    !failIfMajorPerformanceCaveat || mapbox.gpu === 'hardware'

  return { default: { Map: class {}, supported } }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

beforeEach(() => {
  // A fresh module graph and a fresh mock per test: `loadMapLib` caches its import per page.
  vi.resetModules()
  vi.doMock('mapbox-gl', fakeMapboxGl)
  mapbox.evaluations = 0
  mapbox.gpu = 'hardware'
})

const load = async () => (await import('./map-lib')).loadMapLib

describe('loadMapLib', () => {
  it('fetches nothing until a map asks for it', async () => {
    const loadMapLib = await load()

    await settle()
    expect(mapbox.evaluations, 'mapbox-gl evaluated on import').toBe(0)

    await loadMapLib()

    expect(mapbox.evaluations).toBe(1)
  })

  it('imports mapbox-gl once per page', async () => {
    const loadMapLib = await load()

    expect(loadMapLib()).toBe(loadMapLib())
    await loadMapLib()
    expect(mapbox.evaluations).toBe(1)
  })

  it('hands mapbox-gl over where the GPU passes the strict check', async () => {
    const loadMapLib = await load()

    await expect(loadMapLib()).resolves.toHaveProperty('default.Map')
  })

  // react-map-gl 7 refused such a browser before constructing; react-map-gl 8 constructs, and
  // mapbox-gl's own constructor accepts a GPU that only passes the lax check.
  it('refuses a browser that would draw the map in software', async () => {
    mapbox.gpu = 'software'
    const loadMapLib = await load()

    await expect(loadMapLib()).rejects.toThrow('Map is not supported by this browser')
  })

  describe('a refusal before react-map-gl listens', () => {
    const unhandled = vi.fn()

    beforeEach(() => {
      process.on('unhandledRejection', unhandled)
    })

    afterEach(() => {
      process.off('unhandledRejection', unhandled)
      unhandled.mockReset()
    })

    // `<Map>`'s mount effect, where react-map-gl catches and logs it, can run after the import has
    // settled. An unhandled rejection reaches the host page's own error handlers.
    it('is not an unhandled rejection', async () => {
      mapbox.gpu = 'software'
      const loadMapLib = await load()
      const pending = loadMapLib()

      await settle()

      expect(unhandled).not.toHaveBeenCalled()
      await expect(pending).rejects.toThrow('Map is not supported by this browser')
    })
  })
})
