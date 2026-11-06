// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useAreaNames } from './use-area-names'

import { DEFAULT_WIDGET_MODE, WidgetModeContext } from '@/config/mode'

/**
 * `map=false` promises the host no Mapbox request (`docs/embedding.md`), and the area names are a
 * Mapbox lookup fired from an effect. SSR markup never runs that effect, so only a real mount can
 * show whether the request goes out.
 */

const reverse = vi.hoisted(() =>
  vi.fn(async () => ({
    features: [{ properties: { context: { neighborhood: { name: 'Balham' } } } }],
  })),
)

vi.mock('@mapbox/search-js-core', () => ({
  GeocodingCore: class {
    reverse = reverse
  },
}))

// The lookup cache is module state, so each case asks about a spot of its own.
function Probe({ points }: { points: [number, number][] }) {
  const names = useAreaNames(points, 'en')

  return <span>{[...names.values()].map((n) => n.neighborhood).join(',')}</span>
}

let cleanup: (() => void) | null = null

afterEach(() => {
  cleanup?.()
  cleanup = null
  reverse.mockClear()
  vi.unstubAllEnvs()
  sessionStorage.clear()
})

async function mount(hasMap: boolean, points: [number, number][]) {
  vi.stubEnv('VITE_MAPBOX_ACCESSTOKEN', 'pk.test')
  const host = document.createElement('div')
  const root = createRoot(host)

  await act(async () => {
    root.render(
      <WidgetModeContext.Provider value={{ ...DEFAULT_WIDGET_MODE, hasMap }}>
        <Probe points={points} />
      </WidgetModeContext.Provider>,
    )
  })
  // Let the lookup batch settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  cleanup = () => act(() => root.unmount())

  return host
}

describe('useAreaNames', () => {
  it('sends no Mapbox request with map=false, and names nothing', async () => {
    const host = await mount(false, [[-0.1523, 51.4432]])

    expect(reverse).not.toHaveBeenCalled()
    expect(host.textContent).toBe('')
  })

  it('looks the spots up when there is a map', async () => {
    const host = await mount(true, [[-0.0982, 51.3762]])

    expect(reverse).toHaveBeenCalledTimes(1)
    expect(host.textContent).toBe('Balham')
  })
})
