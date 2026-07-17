import { describe, it, expect } from 'vitest'

import { formatDistance, usesMiles } from './distance'

describe('formatDistance', () => {
  it('shows metres below 1 km, rounded to tens', () => {
    expect(formatDistance(0.649, 'en')).toBe('650 m')
    expect(formatDistance(0.04, 'en')).toBe('40 m')
  })

  it('shows one decimal below 10 km and integers above', () => {
    expect(formatDistance(1.24, 'en')).toBe('1.2 km')
    expect(formatDistance(9.96, 'en')).toBe('10 km')
    expect(formatDistance(23.4, 'en')).toBe('23 km')
    expect(formatDistance(123.4, 'en')).toBe('123 km')
  })

  it('uses miles for en-US and en-GB only', () => {
    expect(usesMiles('en-US')).toBe(true)
    expect(usesMiles('en-GB')).toBe(true)
    expect(usesMiles('en')).toBe(false)
    expect(usesMiles('fr')).toBe(false)

    expect(formatDistance(1.609344, 'en-US')).toBe('1 mi')
    expect(formatDistance(16.09344, 'en-US')).toBe('10 mi')
    // Short distances stay in miles (no metres branch for imperial locales).
    expect(formatDistance(0.5, 'en-GB')).toBe('0.3 mi')
  })

  it('localizes the number and unit label', () => {
    // French: comma decimal separator + narrow no-break space (U+202F) before
    // the unit.
    expect(formatDistance(1.24, 'fr')).toBe('1,2 km')
  })
})
