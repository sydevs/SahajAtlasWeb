import { describe, expect, it } from 'vitest'

import { filterRowPlace } from './filter-row'

const wide = { menusWide: true, hasMap: true, top: 'region', calendarFullWidth: false } as const

describe('filterRowPlace', () => {
  it('keeps the Filters button below the width', () => {
    expect(filterRowPlace({ ...wide, menusWide: false })).toBeNull()
  })

  it('puts the row over the map beside any list, the countries root included', () => {
    expect(filterRowPlace(wide)).toBe('map')
    expect(filterRowPlace({ ...wide, top: undefined })).toBe('map')
    expect(filterRowPlace({ ...wide, top: 'event' })).toBe('map')
  })

  it("puts the row in the full-width calendar header, whatever the buttons' own width", () => {
    expect(filterRowPlace({ ...wide, top: 'calendar', calendarFullWidth: true })).toBe('header')
    expect(
      filterRowPlace({ ...wide, menusWide: false, top: 'calendar', calendarFullWidth: true }),
    ).toBe('header')
    expect(
      filterRowPlace({ ...wide, hasMap: false, top: 'calendar', calendarFullWidth: true }),
    ).toBe('header')
  })

  it("treats the calendar's list view as a panel beside the map", () => {
    expect(filterRowPlace({ ...wide, top: 'calendar' })).toBe('map')
    expect(filterRowPlace({ ...wide, menusWide: false, top: 'calendar' })).toBeNull()
  })

  it('has no map row without a map', () => {
    expect(filterRowPlace({ ...wide, hasMap: false })).toBeNull()
  })

  it('shows no row over the filters drawer itself', () => {
    expect(filterRowPlace({ ...wide, top: 'filters' })).toBeNull()
  })
})
