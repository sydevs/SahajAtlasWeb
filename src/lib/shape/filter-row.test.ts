import { describe, expect, it } from 'vitest'

import { filterRowPlace } from './filter-row'

const wide = { chipsWide: true, hasMap: true, top: 'region', calendarCoversMap: false } as const

describe('filterRowPlace', () => {
  it('keeps the Filters button below the width', () => {
    expect(filterRowPlace({ ...wide, chipsWide: false })).toBeNull()
    expect(filterRowPlace({ ...wide, chipsWide: false, top: 'calendar' })).toBeNull()
  })

  it('puts the row over the map beside any list, the countries root included', () => {
    expect(filterRowPlace(wide)).toBe('map')
    expect(filterRowPlace({ ...wide, top: undefined })).toBe('map')
    expect(filterRowPlace({ ...wide, top: 'event' })).toBe('map')
  })

  it('moves the row into the calendar header only where the calendar covers the map', () => {
    expect(filterRowPlace({ ...wide, top: 'calendar', calendarCoversMap: true })).toBe('header')
    // The calendar's list view is the regular panel, with the map beside it.
    expect(filterRowPlace({ ...wide, top: 'calendar' })).toBe('map')
  })

  it('has no map row without a map, except in the calendar header', () => {
    expect(filterRowPlace({ ...wide, hasMap: false })).toBeNull()
    expect(filterRowPlace({ ...wide, hasMap: false, top: 'calendar' })).toBe('header')
  })

  it('shows no row over the filters drawer itself', () => {
    expect(filterRowPlace({ ...wide, top: 'filters' })).toBeNull()
  })
})
