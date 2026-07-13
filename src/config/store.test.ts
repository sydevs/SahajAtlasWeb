import type { Feature } from 'geojson'

import { describe, it, expect, beforeEach } from 'vitest'

import { useSearchState, useViewState } from './store'

import { DEFAULT_FILTERS } from '@/lib/shape'

// The stores are the single source of truth for map view and search filters.
// They're plain zustand vanilla stores, so we drive their actions directly via
// getState() without React. Reset to the initial slice in beforeEach since the
// module singletons persist between tests.

describe('useViewState', () => {
  beforeEach(() => {
    useViewState.setState({
      latitude: 0,
      longitude: 0,
      zoom: 0,
      selection: null,
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
})

describe('useSearchState', () => {
  beforeEach(() => {
    useSearchState.setState({ ...DEFAULT_FILTERS })
  })

  it('setters update each filter field', () => {
    const state = () => useSearchState.getState()

    state().setFormat('online')
    state().setCadence('WEEKLY')
    state().setTimeOfDay([9, 17])

    expect(state()).toMatchObject({ format: 'online', cadence: 'WEEKLY', timeOfDay: [9, 17] })
  })

  it('setDaysOfWeek keeps weekdays sorted', () => {
    useSearchState.getState().setDaysOfWeek([5, 1, 3])

    expect(useSearchState.getState().daysOfWeek).toEqual([1, 3, 5])
  })

  it('toggleLanguage adds then removes a code, staying sorted', () => {
    const state = () => useSearchState.getState()

    state().toggleLanguage('fr')
    state().toggleLanguage('en')
    expect(state().languages).toEqual(['en', 'fr'])

    state().toggleLanguage('fr')
    expect(state().languages).toEqual(['en'])
  })

  it('clearFilters restores the defaults', () => {
    const state = () => useSearchState.getState()

    state().setFormat('online')
    state().setDaysOfWeek([2, 4])
    state().clearFilters()

    expect(state()).toMatchObject(DEFAULT_FILTERS)
  })

  it('setFilters commits a whole filter set at once, sorting arrays', () => {
    useSearchState.getState().setFilters({
      ...DEFAULT_FILTERS,
      format: 'offline',
      daysOfWeek: [5, 1],
      languages: ['fr', 'en'],
    })

    expect(useSearchState.getState()).toMatchObject({
      format: 'offline',
      daysOfWeek: [1, 5],
      languages: ['en', 'fr'],
    })
  })
})
