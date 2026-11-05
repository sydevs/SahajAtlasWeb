import { describe, expect, it } from 'vitest'

import { directionsUrl, isAppleMobile } from './events'

describe('directionsUrl', () => {
  const coords = { latitude: 51.5, longitude: -0.12 }

  it('sends iPhones to Apple Maps and everyone else to Google', () => {
    expect(directionsUrl(coords, true)).toBe('https://maps.apple.com/?daddr=51.5,-0.12')
    expect(directionsUrl(coords, false)).toBe(
      'https://www.google.com/maps/search/?api=1&query=51.5,-0.12',
    )
  })

  it('falls back to encoded address text, and to nothing', () => {
    expect(directionsUrl({ street: '1 High St', city: 'Leeds' }, true)).toBe(
      'https://maps.apple.com/?daddr=1%20High%20St%2C%20Leeds',
    )
    expect(directionsUrl({}, false)).toBeUndefined()
  })
})

describe('isAppleMobile', () => {
  it('spots an iPhone and an iPad reporting as a Mac, not a real Mac', () => {
    expect(isAppleMobile({ userAgent: 'iPhone', maxTouchPoints: 5 })).toBe(true)
    expect(isAppleMobile({ userAgent: 'Macintosh', maxTouchPoints: 5 })).toBe(true)
    expect(isAppleMobile({ userAgent: 'Macintosh', maxTouchPoints: 0 })).toBe(false)
  })
})
