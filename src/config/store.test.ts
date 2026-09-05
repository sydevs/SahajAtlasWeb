import type { Feature } from 'geojson'

import { describe, it, expect, beforeEach } from 'vitest'

import { rememberCamera, useCameraHistory, useCameraSettled, useViewState } from './store'

// These stores are the single source of truth for the map view, plus the registration draft.
// They are plain zustand vanilla stores.
// So this suite drives their actions directly, through `getState()`, with no React.
// Each `beforeEach` resets the initial slice, since the module singletons persist between tests.
// Search filters moved to the URL. Their serialization is covered in `filters.test.ts`.

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

    // `hover` is its own slice. Setting it leaves the committed selection untouched.
    expect(state.hover).toEqual({ latitude: 3, longitude: 4, approximate: true })
    expect(state.selection).toEqual({ latitude: 1, longitude: 2, approximate: false })

    useViewState.getState().setHover(null)
    expect(useViewState.getState().hover).toBeNull()
  })
})

// These are per-`location.key` camera snapshots.
// The map "remembers where you were," so a back navigation restores the viewport instead of re-deriving it.
// The navigation seams write this imperatively, through `getState`. `useFrameOnTop` reads it on a POP.
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

describe('useCameraSettled', () => {
  beforeEach(() => {
    useCameraSettled.setState({ settled: false })
  })

  it('starts unsettled — the map boots on the world view, having arrived nowhere', () => {
    expect(useCameraSettled.getState().settled).toBe(false)
  })

  it('flips once the camera has been commanded', () => {
    useCameraSettled.getState().markSettled()

    expect(useCameraSettled.getState().settled).toBe(true)
  })

  // This is the property that keeps this off the map's hot path.
  // EVERY camera operation calls `markSettled`.
  // A `set` call that returned a fresh object each time would notify subscribers on every pan and zoom.
  // That would re-render the map for a boolean that stopped changing after the first move.
  it('is idempotent by IDENTITY, so a repeat call notifies nobody', () => {
    useCameraSettled.getState().markSettled()

    const first = useCameraSettled.getState()

    useCameraSettled.getState().markSettled()

    expect(useCameraSettled.getState()).toBe(first)
  })

  // The flag describes one map instance, and this store outlives it.
  // A compact embed unmounts the whole interface when its dialog closes.
  // Without this reset, the SECOND view meets a stale `true`.
  // No curtain draws, and the first framing flies across the planet from `[0,0]` zoom 0.
  // That brings back both of the defects this store exists to fix.
  it('is forgotten when the map goes, so the next one arrives afresh', () => {
    useCameraSettled.getState().markSettled()
    expect(useCameraSettled.getState().settled).toBe(true)

    useCameraSettled.getState().forgetSettled()

    expect(useCameraSettled.getState().settled).toBe(false)
  })

  it('forgets idempotently too, so a teardown cannot re-render a live map', () => {
    const before = useCameraSettled.getState()

    useCameraSettled.getState().forgetSettled()

    expect(useCameraSettled.getState()).toBe(before)
  })
})
