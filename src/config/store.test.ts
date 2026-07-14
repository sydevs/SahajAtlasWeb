import type { Feature } from 'geojson'

import { describe, it, expect, beforeEach } from 'vitest'

import { useViewState } from './store'

// The stores are the single source of truth for map view (+ the registration draft).
// They're plain zustand vanilla stores, so we drive their actions directly via
// getState() without React. Reset to the initial slice in beforeEach since the module
// singletons persist between tests. (Search filters moved to the URL — their
// serialization is covered in filters.test.ts.)

describe('useViewState', () => {
  beforeEach(() => {
    useViewState.setState({
      latitude: 0,
      longitude: 0,
      zoom: 0,
      selection: null,
      hover: null,
      boundary: undefined,
    })
  })

  it('setViewState updates the camera fields', () => {
    useViewState.getState().setViewState({ latitude: 51.5, longitude: -0.12, zoom: 8 })

    expect(useViewState.getState()).toMatchObject({ latitude: 51.5, longitude: -0.12, zoom: 8 })
  })

  it('setSelection stores the picked point and setBoundary stores a feature', () => {
    const boundary: Feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [2, 1] },
      properties: {},
    }

    useViewState.getState().setSelection({ latitude: 1, longitude: 2, approximate: true })
    useViewState.getState().setBoundary(boundary)

    const state = useViewState.getState()

    expect(state.selection).toEqual({ latitude: 1, longitude: 2, approximate: true })
    expect(state.boundary).toBe(boundary)
  })

  it('setHover stores a transient highlight independently of the selection', () => {
    useViewState.getState().setSelection({ latitude: 1, longitude: 2, approximate: false })
    useViewState.getState().setHover({ latitude: 3, longitude: 4, approximate: true })

    const state = useViewState.getState()

    // hover is its own slice — setting it leaves the committed selection untouched.
    expect(state.hover).toEqual({ latitude: 3, longitude: 4, approximate: true })
    expect(state.selection).toEqual({ latitude: 1, longitude: 2, approximate: false })

    useViewState.getState().setHover(null)
    expect(useViewState.getState().hover).toBeNull()
  })
})
