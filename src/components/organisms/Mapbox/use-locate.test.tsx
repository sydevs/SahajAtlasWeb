// @vitest-environment jsdom
import type { GeolocateControl } from 'mapbox-gl'
import type { PlaceSearch } from '@/lib/shape'

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useLocate } from './use-locate'

import { useNearMe } from '@/hooks/use-near-me'
import { LocatorProvider } from '@/hooks/use-locator'

/**
 * The WIRING between the two controls and the one locator they share, which the machine's own
 * spec (`lib/locate-machine.test.ts`) cannot reach: that a phase change re-renders both, and
 * that each acts only on its own presses.
 */

vi.mock('@/hooks/use-locale', () => ({ useLocale: () => ({ locale: 'en' }) }))
vi.mock('@/config/api', () => ({
  geojsonQuery: () => ({ queryKey: ['geojson'], queryFn: () => new Promise(() => {}) }),
}))

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const FIX = { coords: { latitude: 50.088, longitude: 14.42 } } as GeolocationPosition

type Probe = {
  map?: ReturnType<typeof useLocate>
  nearMe?: ReturnType<typeof useNearMe>
}

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

/** A GeolocateControl stand-in: `trigger()` starts a request the test answers with `onGeolocate`. */
const control = () => ({ trigger: vi.fn(() => true), once: vi.fn() })

function mount({ map = true, nearMe = true } = {}) {
  const seen: Probe = {}
  const onLocated = vi.fn()
  const onPlace = vi.fn<(place: PlaceSearch) => void>()
  const onRefused = vi.fn()
  const fake = control()

  function MapProbe() {
    const locate = useLocate(onLocated)

    ;(locate.geolocateRef as { current: unknown }).current = fake as unknown as GeolocateControl
    seen.map = locate

    return null
  }

  function NearMeProbe() {
    seen.nearMe = useNearMe({ naming: false, onPlace, onRefused })

    return null
  }

  const render = (shown: { map: boolean; nearMe: boolean }) =>
    act(() => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <LocatorProvider>
            {shown.map && <MapProbe />}
            {shown.nearMe && <NearMeProbe />}
          </LocatorProvider>
        </QueryClientProvider>,
      )
    })

  render({ map, nearMe })

  return { seen, onLocated, onPlace, onRefused, fake, render }
}

/** Answers the outstanding request through the map control, as Mapbox's `geolocate` event does. */
const answer = async (seen: Probe) => {
  await act(async () => seen.map!.onGeolocate(FIX))
}

/** Refuses it, as Mapbox's `error` event does. */
const refuse = async (seen: Probe) => {
  await act(async () => seen.map!.onError())
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('the shared locate status', () => {
  it('ignores a second tap while the request is out, and navigates once', async () => {
    const { seen, onLocated, fake } = mount({ nearMe: false })

    act(() => seen.map!.locate())
    act(() => seen.map!.locate())
    expect(fake.trigger).toHaveBeenCalledTimes(1)
    expect(seen.map!.state).toBe('locating')

    await answer(seen)
    expect(seen.map!.state).toBe('found')
    expect(onLocated).toHaveBeenCalledTimes(1)
  })

  it('opens the dialog on its own refusal, and a late fix closes it as found', async () => {
    const { seen, onLocated } = mount({ nearMe: false })

    act(() => seen.map!.locate())
    await refuse(seen)
    expect(seen.map!.state).toBe('failed')
    expect(seen.map!.dialogOpen).toBe(true)

    await answer(seen)
    expect(seen.map!.state).toBe('found')
    expect(seen.map!.dialogOpen).toBe(false)
    expect(onLocated).toHaveBeenCalledWith(FIX)
  })

  it('lights the map button when Near me finds the visitor', async () => {
    const { seen, onLocated, onPlace } = mount()

    act(() => seen.nearMe!.locate())
    expect(seen.map!.state).toBe('locating')
    expect(seen.nearMe!.status).toBe('locating')

    await answer(seen)
    expect(seen.map!.state).toBe('found')
    expect(seen.nearMe!.status).toBe('idle')
    expect(onPlace).toHaveBeenCalledTimes(1)
    // The fix was Near me's to act on, not the map button's.
    expect(onLocated).not.toHaveBeenCalled()
  })

  it('shows a refusal only where it was pressed', async () => {
    const { seen, onRefused } = mount()

    act(() => seen.map!.locate())
    await refuse(seen)
    expect(seen.map!.state).toBe('failed')
    // Near me's alert would announce the map button's failure as its own.
    expect(seen.nearMe!.status).toBe('idle')
    expect(onRefused).not.toHaveBeenCalled()

    act(() => seen.map!.setDialogOpen(false))
    act(() => seen.nearMe!.locate())
    await refuse(seen)
    expect(seen.nearMe!.status).toBe('failed')
    expect(onRefused).toHaveBeenCalledTimes(1)
    // Near me reports its own failure in place; the map's dialog is for the map's press.
    expect(seen.map!.dialogOpen).toBe(false)
  })

  it('drops an answer that arrives after Near me has gone', async () => {
    const { seen, onPlace, render } = mount()

    act(() => seen.nearMe!.locate())
    render({ map: true, nearMe: false })
    await answer(seen)
    expect(seen.map!.state).toBe('found')
    expect(onPlace).not.toHaveBeenCalled()
  })

  // Mapbox answers nothing once its control has left the map.
  it('fails the request when the map leaves mid-request', async () => {
    const { seen, render } = mount()

    act(() => seen.nearMe!.locate())
    render({ map: false, nearMe: true })
    await act(async () => {})
    expect(seen.nearMe!.status).toBe('failed')
  })
})
