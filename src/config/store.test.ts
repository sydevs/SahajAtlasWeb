import type { Feature } from 'geojson'

import { describe, it, expect, beforeEach } from 'vitest'

import { rememberCamera, useCameraHistory, useViewState } from './store'

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

// Per-location.key camera snapshots: the map "remembers where you were" so a back
// navigation restores the viewport instead of re-deriving it. Written imperatively
// (getState) from the navigation seams, read on a POP by useFrameOnTop.
describe('useCameraHistory', () => {
  beforeEach(() => {
    useCameraHistory.setState({ snapshots: {} })
    useViewState.setState({
      latitude: 0,
      longitude: 0,
      zoom: 0,
      selection: null,
      hover: null,
      boundary: undefined,
    })
  })

  it('saves and reads a snapshot by key; misses return undefined', () => {
    const camera = { zoom: 8, latitude: 51.5, longitude: -0.12, selection: null }

    useCameraHistory.getState().save('abc', camera)

    expect(useCameraHistory.getState().read('abc')).toEqual(camera)
    expect(useCameraHistory.getState().read('missing')).toBeUndefined()
  })

  it('save overwrites the same key and leaves others intact', () => {
    const { save, read } = useCameraHistory.getState()

    save('k', { zoom: 1, latitude: 1, longitude: 1 })
    save('other', { zoom: 9, latitude: 9, longitude: 9 })
    save('k', { zoom: 2, latitude: 2, longitude: 2 })

    expect(read('k')).toMatchObject({ zoom: 2 })
    expect(read('other')).toMatchObject({ zoom: 9 })
  })

  it('rememberCamera snapshots the live view state (camera + selection + boundary)', () => {
    const boundary: Feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [2, 1] },
      properties: {},
    }

    useViewState.getState().setViewState({ latitude: 40.7, longitude: -74, zoom: 12 })
    useViewState.getState().setSelection({ latitude: 40.7, longitude: -74, approximate: false })
    useViewState.getState().setBoundary(boundary)

    rememberCamera('entry-1')

    expect(useCameraHistory.getState().read('entry-1')).toEqual({
      zoom: 12,
      latitude: 40.7,
      longitude: -74,
      selection: { latitude: 40.7, longitude: -74, approximate: false },
      boundary,
    })
    // The transient hover is intentionally NOT part of a restore snapshot.
    expect(useCameraHistory.getState().read('entry-1')).not.toHaveProperty('hover')
  })
})
