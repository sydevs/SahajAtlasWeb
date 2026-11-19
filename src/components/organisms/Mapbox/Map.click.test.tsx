// @vitest-environment jsdom
//
// jsdom, because both properties are about a RE-RENDER: a click handler memoised in one render
// and called after a later one, and whether a store write causes a render at all. SSR markup
// expresses neither (`docs/testing.md`).
import type { MapMouseEvent } from 'react-map-gl'

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Mapbox } from './Map'
import { LAYER_IDS } from './layers'

import { useViewState } from '@/config/store'

// Everything the component reads is stubbed at its own hook, with one identity per value, so the
// only things that change between two renders are the ones a case changes on purpose.
const harness = vi.hoisted(() => ({
  renders: 0,
  onClick: undefined as ((event: unknown) => void) | undefined,
  moveMap: (() => {}) as (options: unknown) => void,
  navigate: () => {},
  geolocate: () => {},
  filters: {},
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  locale: { t: (key: string) => key, locale: 'en', languageCode: 'en' },
  mapbox: {
    getLanguage: () => 'en',
    getZoom: () => 5,
    getSource: () => ({
      getClusterExpansionZoom: (_id: unknown, done: (error: null, zoom: number) => void) =>
        done(null, 7),
    }),
  },
}))

vi.mock('react-map-gl', async () => {
  const { forwardRef } = await import('react')
  const none = () => null

  return {
    // Records the handler the map was last handed, which is the one a click reaches.
    default: forwardRef(function FakeMap(props: { onClick?: (event: unknown) => void }, _ref) {
      harness.renders += 1
      harness.onClick = props.onClick

      return null
    }),
    AttributionControl: none,
    GeolocateControl: none,
    Layer: none,
    Popup: none,
    Source: none,
  }
})
vi.mock('@/hooks/use-mapbox', () => ({
  useMapbox: () => ({ mapbox: harness.mapbox, padding: harness.padding, moveMap: harness.moveMap }),
}))
vi.mock('@/hooks/use-atlas-navigate', () => ({ useAtlasNavigate: () => harness.navigate }))
vi.mock('@/hooks/use-locale', () => ({ useLocale: () => harness.locale }))
vi.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ theme: 'light' }) }))
vi.mock('@/hooks/use-filters', () => ({ useEventFilters: () => harness.filters }))
vi.mock('@/hooks/use-region-matcher', () => ({ useRegionMatcher: () => undefined }))
vi.mock('@/hooks/use-geolocate', () => ({ useGeolocateToSearch: () => harness.geolocate }))
vi.mock('@/hooks/use-event-display', () => ({
  calendarLineParts: () => ({}),
  useEventDisplay: () => ({}),
}))
vi.mock('@/config/responsive', () => ({ useHasRealPointer: () => true }))
vi.mock('@/config/api', () => ({
  eventTitlesQuery: () => ({ queryKey: ['titles'] }),
  geojsonQuery: () => ({ queryKey: ['geojson'] }),
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: undefined }),
}))
vi.mock('@/components/atoms/Button', () => ({ Button: () => null }))
vi.mock('@/components/atoms/Modal', () => ({
  Modal: () => null,
  ModalClose: () => null,
  ModalContent: () => null,
  ModalFooter: () => null,
}))
vi.mock('./markers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./markers')>()),
  registerMarkerImages: () => () => {},
}))

const clusterClick = {
  features: [
    {
      layer: { id: LAYER_IDS.cluster },
      properties: { cluster_id: 1 },
      geometry: { type: 'Point', coordinates: [14.4, 50.1] },
    },
  ],
} as unknown as MapMouseEvent

let container: HTMLDivElement
let root: Root

const render = () => act(async () => root.render(<Mapbox />))

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  harness.renders = 0
  harness.onClick = undefined
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('Mapbox — the cluster click', () => {
  // `useMapbox` hands out a new `moveMap` whenever the camera padding changes, which a sheet snap
  // or a layout flip does with no camera move and no navigation. A handler still holding the old
  // one eases the expansion around a panel that is no longer where the padding says.
  it('expands through the camera move of the current padding, not the one it mounted with', async () => {
    const mounted = vi.fn()
    const current = vi.fn()

    harness.moveMap = mounted
    await render()
    harness.moveMap = current
    await render()

    harness.onClick?.(clusterClick)

    expect(current).toHaveBeenCalledTimes(1)
    expect(current.mock.calls[0][0]).toMatchObject({ center: [14.4, 50.1], zoom: 8 })
    expect(mounted).not.toHaveBeenCalled()
  })
})

describe('Mapbox — the hot render path', () => {
  // The map is uncontrolled: it takes no `viewState`, and `onMoveEnd` only mirrors the camera into
  // the store for other readers. Subscribing to that mirror re-rendered the whole map, every
  // source and layer under it, each time the camera stopped.
  it('does not re-render when the camera stops', async () => {
    await render()

    const settled = harness.renders

    await act(async () =>
      useViewState.getState().setViewState({ zoom: 9, latitude: 51.5, longitude: -0.1 }),
    )

    expect(harness.renders).toBe(settled)
  })

  // The other direction, so the case above cannot pass because no store write reaches the fake.
  it('still re-renders for a field it draws', async () => {
    await render()

    const settled = harness.renders

    await act(async () =>
      useViewState.getState().setSelection({ latitude: 50.1, longitude: 14.4, approximate: false }),
    )

    expect(harness.renders).toBeGreaterThan(settled)
  })
})
